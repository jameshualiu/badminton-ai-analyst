# Badminton AI Analyst — Data Flow & Pipeline

---

## 1. Frontend → Backend Pipeline

### Upload flow (3 steps)

The user opens the `UploadModal`, selects a video file, and the `createAndUploadVideo()` function in `videoService.ts` orchestrates a three-step handshake:

**Step 1 — Init** (`POST /api/videos/init`)
The frontend sends `{ filename, contentType, size }` with a Firebase JWT in the `Authorization` header. The Express backend's `authMiddleware` verifies the token, then `VideoService.initializeUpload()` does two things atomically: it generates a presigned `PUT` URL (valid 1 hour) pointing directly at IDrive E2 (Cloudflare R2-compatible), and creates a Firestore document at `users/{uid}/videos/{videoId}` with status `uploading`. The presigned URL and `videoId` are returned to the frontend.

**Step 2 — Direct upload to storage**
The frontend `PUT`s the raw video file directly to the presigned E2 URL — the backend is never in the upload path. This keeps the Express server lightweight and avoids proxying large files.

**Step 3 — Complete** (`POST /api/videos/:videoId/complete`)
The frontend notifies the backend that the upload finished. The backend marks the Firestore doc as `queued` and then **fire-and-forgets** a `POST` to `MODAL_WEBHOOK_URL` with `{ videoId, userId, videoE2Key }`. The user gets an instant `{ status: "queued" }` response while the ML worker boots asynchronously.

### Status polling via Firestore real-time subscription

The frontend's `useUserVideos` hook opens a Firestore `onSnapshot` listener on `users/{uid}/videos` ordered by `createdAt`. Any status change written by the backend or ML worker (`uploading → queued → running → done / failed`) is pushed to the frontend in real time — no polling needed. The `DashboardPage` renders these as `VideoCard` components showing current status.

### Results fetch

When a video reaches `done`, the user navigates to `AnalysisPage`. It calls `getVideoResults(videoId, token)` which hits `GET /api/videos/:videoId/results`. The backend generates a time-limited presigned `GET` URL for the `analysis.json` stored in E2 and returns `{ status, urls: { originalVideo, analysisJson } }`. The frontend then fetches the JSON payload directly from E2 using that URL.

---

## 2. ML Pipeline (Python Worker on Modal)

The worker runs as a Modal `fastapi_endpoint` on an NVIDIA T4 GPU with a 20-minute timeout. It receives `{ videoId, userId, videoE2Key }` from the backend webhook.

### Model loading

Five models are resolved from a persistent Modal Volume (with R2 as a fallback if missing):

| Key | File | Purpose |
|---|---|---|
| `tracknet` | `ball_track.pt` | Shuttle position heatmaps (TrackNet) |
| `court_kprcnn` | `court_kpRCNN.pth` | 6-point + 35-point court keypoints |
| `net_kprcnn` | `net_kpRCNN.pth` | Net keypoint detection |
| `yolo_pose` | `yolo11x-pose.pt` | Player bounding boxes + 17-point COCO skeleton |
| `lstm` | `15Matches_LSTM.onnx` | Shot type classifier |

### Pipeline steps

**Homography setup**
The first 150 frames are scanned in steps of 10. Once a frame yields 6 court keypoints (TL, TR, ML, MR, BL, BR), `cv2.findHomography` computes a perspective matrix mapping pixel coordinates → real-world meters (court is 6.1m × 13.4m). All downstream `location_m` values are produced by this transform.

**Pass 1 — Shuttle tracking (TrackNet, batch size 8)**
Every frame is processed. Each batch stacks three consecutive RGB frames into a `(N, 9, 288, 512)` float32 tensor (normalized 0–1). TrackNet outputs a `(288, 512)` heatmap per frame; the argmax gives `(x, y)` in pixels. Detections with confidence < 0.25, or outside the court's y-bounds, are dropped. Result: `shuttle_traj` — a list of `{ frame, pos: [x,y]|None, confidence }`.

**Pass 2 — Pose inference (YOLO11x-pose, batch size 16)**
Frames are decoded at 512×288 and passed to YOLO in batches. Per-frame player detections are filtered to those whose body center or ankle midpoint falls within the court boundary (with 80px padding). Players are sorted top-to-bottom (far player first). Result: `player_tracking` — a list of `{ frame, players: [{ skeleton, box }] }`.

**Hit detection — trajectory signal (primary)**
`_detect_hits_from_traj()` splits the shuttle trajectory into continuous segments (gap > 4 frames = new segment). A gap of 8–50 frames between segments where the incoming and outgoing velocity vectors have a negative dot product (direction reversal) is classified as a hit. A secondary pass scans within segments for in-segment direction reversals using a 3-frame velocity window. Minimum 20-frame debounce between hits.

**Hit detection — pose signal (secondary)**
`_detect_hits_from_pose()` computes per-frame wrist speed by matching players frame-to-frame (within 100px). Frames where wrist speed > 22 px/frame and the shuttle is within 80px of a wrist are flagged as hits. This catches cases where TrackNet loses the shuttle but the swing is clearly visible.

**Hit merging**
`_merge_hits()` cross-validates both signals. Hits within 25 frames of each other in both signals are marked `confirmed: True` (both agree). Solo trajectory or solo pose hits are kept but marked `confirmed: False`. Final debounce of 20 frames with preference for confirmed hits.

**Shot classification**
If the LSTM is available, a 31-frame window (15 before + hit + 15 after) is built per hit. The hitter is identified as the player whose foot x-coordinate is closest to the shuttle x at the hit frame, and that player index is locked for the entire window. 13 COCO keypoints per frame (`[15, 7, 11, 13, 5, 9, 0, 16, 8, 12, 14, 6, 10]`) are extracted, zero-padded for missing frames, and passed to `ShotClassifierAdapter.classify()`. Without LSTM, a rule-based fallback uses post-hit shuttle trajectory (average vertical velocity and speed) to determine shot type: Clear, Lob, Smash, Drive, Drop, or Net.

**Output**
`analysis.json` is written to E2 at `outputs/{userId}/{videoId}/analysis.json`. Firestore is updated: `status: "done"`, `analysisJson` (the E2 key), `totalShots`, `duration`.

---

## 3. Data Structures

### Firestore document — `users/{uid}/videos/{videoId}`

```json
{
  "title": "string",
  "ownerId": "uid",
  "createdAt": "Timestamp",
  "updatedAt": "Timestamp",
  "status": "uploading | queued | running | done | failed",
  "progress": { "stage": "string", "pct": 0 },
  "input": {
    "e2Key": "uploads/{uid}/{videoId}/{filename}",
    "contentType": "video/mp4",
    "sizeBytes": 0,
    "originalFilename": "string"
  },
  "analysisJson": "outputs/{uid}/{videoId}/analysis.json",
  "duration": 0,
  "totalShots": 0,
  "artifacts": {
    "track": null, "events": null, "poses": null, "metrics": null,
    "heatmapImage": null, "heatmapPoints": null, "summary": null,
    "annotatedVideo": null, "thumbnail": null
  },
  "summary": {
    "durationSec": null, "totalShots": null, "shotCounts": {},
    "trackingQuality": { "ballVisiblePct": null }
  }
}
```

### `analysis.json` — the ML output payload

```json
{
  "summary": {
    "durationSec": 60.0,
    "totalShots": 42,
    "shotCounts": { "Clear": 12, "Smash": 8, "Drop": 7, "Drive": 6, "Net": 5, "Lob": 4 },
    "resolution": [512, 288]
  },
  "geometry": {
    "court": [[x,y], ...],
    "net": [[x,y], ...],
    "court_keypoints_6": [[TL], [TR], [ML], [MR], [BL], [BR]],
    "court_keypoints_35": [[x,y], ...]  // 7 rows × 5 cols grid
  },
  "events": [
    {
      "frame": 142,
      "location_px": [210, 180],
      "location_m": [3.1, 2.4],
      "type": "Clear",
      "confirmed": true
    }
  ],
  "tracking": [
    {
      "frame": 0,
      "players": [
        {
          "skeleton": [[x,y], ...],  // 17 COCO keypoints
          "box": [x1, y1, x2, y2]
        }
      ]
    }
  ],
  "shuttle_debug": [
    { "frame": 0, "pos": [210, 180], "confidence": 0.87 }
  ]
}
```

### Frontend TypeScript types (`types.ts`)

The `AnalysisData` interface mirrors the JSON payload exactly. `DashboardVideoCard` is the lean type derived from the Firestore doc for the dashboard list (id, title, date, status, totalShots, duration). `AnalysisShot` maps to each event in `events[]`.

---

## 4. End-to-End Data Flow (incorporating Notion research context)

The app's architecture is shaped by the research insight from VIRD (Lin et al., IEEE TVCG 2024) that coaches want *actionable, stroke-level* feedback rather than raw video. Every layer of the system is designed to progressively distill raw video into meaningful metrics.

**Raw video → E2 storage**
The user uploads an MP4 from the browser. The file travels directly from the browser to IDrive E2 via a presigned URL — never touching the Express server. The Firestore document is the single source of truth for job state throughout.

**E2 → Modal worker → analysis.json**
The worker downloads the video to `/tmp`, runs the full pipeline, and writes `analysis.json` back to E2 under `outputs/`. The Firestore doc is updated at key milestones (`running` on start, `done` or `failed` on finish), which the frontend reflects in real time.

**analysis.json → frontend visualization**
The `AnalysisPage` fetches a time-limited presigned URL from the backend, then downloads `analysis.json` directly from E2. The payload drives two primary views:

- **ShotHeatmap**: Takes `events[].location_m` — real-world meter coordinates on the 6.1m × 13.4m court — and normalizes them to percentages for SVG overlay. The `court_keypoints_35` (35-point grid) is projected via `projectToPercent()` to draw accurate court lines using 57 predefined edges. Each shot dot is colored by type and animated in.

- **LiveTracker** (planned): Uses `tracking[].players[].skeleton` and `shuttle_debug` to replay player movement and shuttle position frame-by-frame.

**Shot classification as the key insight layer**
Inspired by ShuttleSet (Wang et al., KDD 2023) — which provides 36,492 labeled strokes as the training backbone for most badminton ML — the pipeline classifies each detected hit into one of six shot types (Clear, Smash, Drop, Drive, Net, Lob) using the LSTM over 31-frame skeleton sequences. The `shotCounts` summary in both the JSON and Firestore gives the dashboard its primary metric.

**Footwork analysis (planned, per research)**
The Frontiers in Sports (2026) paper on world-class footwork validates court coverage heatmaps and center court recovery distance as meaningful metrics. The `location_m` data on each shot event — and potentially `tracking[].players[].skeleton` ankle positions — feeds directly into this. The homography transform is the bridge: pixel coordinates become real meter positions on a standardized 6.1 × 13.4m court, enabling distance calculations that are comparable across different video angles.

**Comparison to pro players (V4 vision)**
The roadmap notes inspiration from swing.vision and ambition to compare a player's shot distribution and court coverage against world-class benchmarks. The ShuttleSet dataset and CoachAI-Plus (AAAI 2023) provide exactly this reference data — labeled strokes from professional matches that the LSTM was trained on, making the gap between "what you hit" and "what pros hit" a direct output of the existing data structures.

---

## Summary: How data moves

```
Browser (React/TS)
  │
  ├─ POST /api/videos/init ──────────► Express backend
  │                                        │
  │  ◄── { videoId, uploadUrl } ───────────┤
  │                                        │ creates Firestore doc
  ├─ PUT video ──────────────────────► IDrive E2 (R2)
  │
  ├─ POST /api/videos/:id/complete ──► Express backend
  │                                        │ marks "queued"
  │  ◄── { status: "queued" } ─────────────┤
  │                                        │ fire-and-forget POST
  │                                        ▼
  │                                   Modal Worker (T4 GPU)
  │                                        │ pulls video from E2
  │                                        │ TrackNet → shuttle traj
  │                                        │ YOLO pose → player skeletons
  │                                        │ hit detection + merge
  │                                        │ LSTM classification
  │                                        │ writes analysis.json → E2
  │                                        │ updates Firestore → "done"
  │
  ├─ Firestore onSnapshot ◄─ status "done" (real-time push)
  │
  ├─ GET /api/videos/:id/results ────► Express backend
  │  ◄── { status, urls: { analysisJson } }
  │
  ├─ GET analysis.json ──────────────► IDrive E2
  │  ◄── AnalysisData payload
  │
  └─ Renders ShotHeatmap + LiveTracker from AnalysisData
```
