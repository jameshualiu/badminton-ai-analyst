# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Badminton AI Analyst: users upload match video, a Python CV/ML pipeline extracts shuttle tracking, court geometry, player poses, hit events, and shot-type classification, and the frontend visualizes it. Three independently deployed pieces:

- `frontend/badminton-ai` — React 19 + TypeScript + Vite SPA (Firebase Auth, Tailwind v4)
- `backend` — Node/Express 5 API (thin orchestration layer: presigned uploads, Firestore, triggers the worker)
- `worker` — Python ML pipeline, deployed to Modal as a GPU (T4) serverless function

Read `data-flow.md` at the repo root before making cross-cutting changes — it documents the full upload → processing → results flow, the Firestore document schema, and the `analysis.json` payload shape in detail. Don't duplicate that content here; treat it as the source of truth for data contracts.

## Commands

### Frontend (`frontend/badminton-ai`)
```bash
npm run dev       # Vite dev server (localhost:5173)
npm run build     # tsc -b && vite build
npm run lint      # eslint .
```

### Backend (`backend`)
```bash
npm run dev       # nodemon server.js (localhost:3000)
npm start         # node server.js
```
No test script is configured (`npm test` is a stub).

### Worker (`worker`)
```bash
pip install -r requirements.txt
pytest worker/tests/                        # run all tests
pytest worker/tests/test_shuttle_in_court.py -v   # single file
```
Worker tests deliberately **reimplement** small pieces of `pipeline.py` logic locally instead of importing the module, because importing `pipeline.py`/`inference.py` pulls in torch/onnxruntime/decord and requires real model weights. When you change geometry/hit-detection logic in `pipeline.py`, update the mirrored copy in the corresponding test file too — search `worker/tests/` for the function name to find it.

### Full stack (Docker)
```bash
docker compose up --build
```
Brings up `backend` (3000) and `frontend` (5173) containers. The worker is **not** part of docker-compose — it only runs on Modal (`modal deploy worker/app.py` / `modal run worker/app.py`), since it needs GPU and the model volume.

## Architecture

### Backend: layered DI, no framework magic
`server.js` wires everything by hand: `VideoRepository(db) → VideoService(repo) → VideoController(service)`, then binds controller methods to Express routes. To trace a request, start at the route in `server.js`, then follow into `src/controller/VideoController.js` → `src/service/VideoService.js` → `src/repository/VideoRepository.js`. Auth is `authMiddleware` (verifies Firebase JWT, sets `req.user.uid`); errors are thrown as `AppError` and caught centrally by `errorHandler`; routes are wrapped in `asyncHandler` to forward rejected promises to `next()`.

The backend never touches raw video bytes — uploads and downloads go directly between the browser/worker and IDrive E2 (S3-compatible, via `@aws-sdk/client-s3` + presigned URLs in `src/config/r2.js`). The backend's job is: mint presigned URLs, own the Firestore doc as the single source of truth for job status, and fire-and-forget a webhook POST to `MODAL_WEBHOOK_URL` to kick off processing (see `finalizeUpload` in `VideoController.js`).

### Worker: two-pass CV pipeline with learned + heuristic fallbacks
Entry point is `worker/app.py` (Modal `fastapi_endpoint`), which resolves model weights from a persistent Modal Volume (falling back to R2 if missing), then calls `BadmintonPipeline.process_video()` in `worker/pipeline.py`.

Model adapters live in `worker/detectors/` and are composed by `worker/inference.py`'s `BadmintonInference`, which decides at load time which optional models are actually available and picks the best path:
- Shuttle tracking: TrackNetV3 (`detectors/tracknet_v3.py`, windowed + InpaintNet rectification) if weights present, else legacy single-frame TrackNet.
- Hit detection: learned CNN detector (`detectors/hit_detector.py`) if `hit_detector_v3.onnx` present, else the heuristic dual-signal approach in `pipeline.py` (trajectory gap/reversal detection + wrist-velocity peaks, cross-validated in `_merge_hits`).
- Shot classification: BST stroke classifier (`detectors/stroke_classifier.py`, 25-class, full-sequence side assignment) if present, else LSTM (`detectors/court_detector.py`'s `ShotClassifierAdapter`) over a 31-frame skeleton window, else rule-based fallback (`_classify_shot_rules`) using post-hit trajectory shape.

Every optional-model path in `pipeline.py`/`inference.py` is written to gracefully no-op to the next fallback rather than erroring — preserve that pattern when adding new models.

`pipeline.py`'s `process_video()` is the pipeline in order: `setup_homography` (finds 6 court keypoints in the first 150 frames, computes the pixel→meters perspective transform for the 6.1×13.4m court) → shuttle tracking pass → HD pose inference pass → hit detection → hit merging → classification → optional BST override + location refinement. Frame coordinates flow between a low-res reader (512×288, TrackNet/homography) and an HD reader (1280×720, pose) — court keypoints and player boxes/skeletons are scaled between the two explicitly (`_scale_player`, the `sx`/`sy` factors in `process_video`); don't assume a single resolution throughout.

`worker/train/` and `.bst-ref/` hold training scripts and reference code for the BST classifier (trained on the ShuttleSet dataset, see `ShuttleSet/`) — not part of the runtime path.

### Frontend: feature-folder + hooks, Firestore as real-time state
Firebase project config: `src/lib/firebase.ts`. Auth state: `src/auth/` (`ProtectedRoute`, `useAuthUser` hook). Feature-specific logic for video analysis lives under `src/features/analysis/` (`videoService.ts` for the API/upload orchestration, `types.ts` for the `AnalysisData` shape mirroring `analysis.json`, `hooks/` and `components/`).

Video list state is never polled — `DashboardPage` relies on a Firestore `onSnapshot` listener (`useUserVideos`) so status transitions (`uploading → queued → running → done/failed`) push in real time. `AnalysisPage` fetches presigned URLs from the backend once, then reads `analysis.json` directly from E2.

`src/lib/result.ts` defines a `Result<T, E>` (`ok`/`err`) discriminated union used in place of throwing for expected failure paths — prefer it over exceptions for functions where the caller is expected to branch on failure (e.g. auth actions), consistent with `src/auth/authActions.ts`.

Active UI theme is blue-black (`theme-ai-saas` dark), primary `#3B82F6` — not amethyst/purple. Tailwind v4 config lives in `src/styles/tailwind.css` (CSS-based config, no `tailwind.config.js`).

## Working across the stack

Because the frontend, backend, and worker communicate only through Firestore documents and `analysis.json` in E2 — never direct calls — changes to either data shape must be kept in sync across three places: `worker/pipeline.py`'s return dict, the frontend's `AnalysisData` type (`src/features/analysis/types.ts`), and the Firestore schema fields the backend/worker write to. `data-flow.md` documents the current shape of both; update it when the shape changes.
