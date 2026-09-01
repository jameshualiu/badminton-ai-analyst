# Project Backlog — Badminton AI Analyst

Organized into four tracks: repo/documentation hygiene, backend, frontend, and worker.

Recommended starting point: **BE-06** — make rate limiting serverless-safe (the in-memory store resets per serverless instance on Vercel). **BE-07** (tear down Render) is deferred a few days to confirm the Vercel backend stays stable before removing the fallback.

**2026-07-31 full-codebase audit** (BE-08 through REPO-06 below) surfaced higher-urgency items than the above two — in particular **WK-06/WK-07** (the Modal worker webhook has no authentication and trusts `videoId`/`videoE2Key` without validation — anyone with the URL can trigger processing against arbitrary Firestore docs/storage keys) and **WK-09** (videos are silently truncated to ~60-72s, a functional/product bug, not just a hygiene issue). Recommend triaging the new High-priority items (FE-06/07/08, REPO-05) before continuing down the BE-06/07 track — BE-08/09 and WK-06/07/08/09 have since shipped, see the 2026-08-31 note below.

> Note while auditing: **BE-06 looks like it may already be implemented** — `backend/src/config/redis.js` + `backend/src/middleware/rateLimiter.js` contain a working Redis-backed store with a fail-open wrapper, gated on `REDIS_URL`. Worth confirming `REDIS_URL` is actually set in the Vercel production env before treating this ticket as resolved.

**2026-08-18 evaluation-readiness audit** (**WK-19**, **EVAL-01** through **EVAL-06** below) — triggered by wanting to cite real, defensible model-performance numbers on a resume rather than guessed ones. Headline finding: **WK-19** is a previously-undocumented production correctness bug, not just an eval gap — the BST stroke classifier (the most accurate model, apparently already deployed per prior session notes) emits a 12-class vocabulary that doesn't match the product's advertised 6-class taxonomy (Clear/Smash/Drop/Drive/Net/Lob), so ~7 of its 12 classes render as unlabeled grey dots/bars in the UI today. Fix that first — it also blocks a clean shot-classifier accuracy number. Separately, the codebase is in much better eval shape than expected: **ShuttleSet is already fully integrated locally** (153 stroke-level CSVs + `homography.csv` ground-truth court corners + 43 of 44 real match videos, all gitignored/local-only — see EVAL-06), and a proper held-out-set harness already exists and has already produced one real, reproducible number (`worker/train/evaluate_detector.py` → HitDetectorCNN 93% event-level P/R). The BST "76%" figure floating in prior notes is **not** resume-defensible as-is — it comes from `.bst-ref/validate_bst.py`, a one-off script hardcoded to a single ~22-second rally window on one machine. See EVAL-01/04 before citing it anywhere.

**2026-08-19 backlog triage for recruiter/engineering signal** — re-sorted the (then-)46 open tickets by resume/interview value, not just severity, per request. **Tier 1** below (15 tickets remaining as of 2026-08-31; 5 have shipped, see that note below) is everything worth featuring on its own: named CVEs/CWEs (unauthenticated endpoint, path traversal, unsafe deserialization), real correctness/data-integrity bugs, quantifiable cost/perf engineering (GPU cold-start reuse, bundle splitting), testing/CI maturity, and the ML evaluation work — start there. **Tier 2** consolidates 22 more tickets that are still worth doing but individually low-signal (env var validation, CORS headers, keyboard nav, code-style consistency) into 6 batch tickets so they don't crowd out the list. **5 tickets are flagged to close outright** — dead code, moot-once-superseded, or zero functional impact — see the bottom of TODO.

**2026-08-31 shipped:** WK-19 (PR [#24](https://github.com/jameshualiu/shuttleye/pull/24)), SEC-01 (PR [#25](https://github.com/jameshualiu/shuttleye/pull/25)), SEC-02 (PR [#26](https://github.com/jameshualiu/shuttleye/pull/26)), WK-09 (PR [#27](https://github.com/jameshualiu/shuttleye/pull/27)), COMBINED-01/BE-08+BE-14 (PR [#28](https://github.com/jameshualiu/shuttleye/pull/28)), BE-09 (PR [#29](https://github.com/jameshualiu/shuttleye/pull/29)) — all merged to `main`, removed from TODO below.

---

## TODO

_Reorganized 2026-08-19 by recruiter/engineering signal rather than raw severity — see the triage note above. Original ticket IDs are preserved in brackets for traceability back to the audits that found them; merged tickets get a new ID._

### 🥇 Tier 1 — High-Impact Engineering (start here)

#### Correctness & Reliability

- [ ] **[BE-11] Validate upload metadata (`contentType`, `size`, `filename`)**
  **Target File(s):** `backend/src/controller/VideoController.js:12-22`, `backend/src/service/VideoService.js:14-39`
  **Description:** `initUpload` only checks truthiness — no MIME allowlist, no size cap, no `content-length-range` on the presigned URL, so actual uploaded bytes can differ arbitrarily from what's recorded. Real cost/abuse-prevention gap, not a nicety.
  **Acceptance Criteria:**
  - [ ] `contentType` validated against a video-MIME allowlist; `size` validated under a defined max (matching the advertised "up to 2GB").
  - [ ] Presigned upload enforces `content-length-range`.

- [ ] **[FE-06] Fix upload getting permanently stuck at ~90% on ID-token failure**
  **Target File(s):** `frontend/badminton-ai/src/pages/DashboardPage.tsx:134-138`, `frontend/badminton-ai/src/features/analysis/components/UploadModal.tsx:82-99`
  **Description:** `getIdToken()` and `onUpload()` both run outside any try/catch — a token refresh failure (revoked session, offline) leaves the progress interval running and the modal frozen at ~90% with no retry path short of closing the dialog. Breaks the core upload flow.
  **Acceptance Criteria:**
  - [ ] Both calls wrapped in try/catch, returning an `Err` result / transitioning to a visible error+retry state.

- [ ] **[FE-07] Enforce real client-side file validation on upload**
  **Target File(s):** `frontend/badminton-ai/src/features/analysis/components/UploadModal.tsx:78-80`
  **Description:** Only checks the spoofable browser-reported MIME type, no size check despite advertising "up to 2 GB" — an oversized file starts uploading before any server-side limit can reject it.
  **Acceptance Criteria:**
  - [ ] File-size cap enforced pre-upload; type checked via MIME + extension; rejection shows a visible error.

- [ ] **[FE-09] Guard against malformed `analysis.json` freezing the canvas render loop**
  **Target File(s):** `frontend/badminton-ai/src/features/analysis/types.ts:34-40`, `frontend/badminton-ai/src/pages/AnalysisPage.tsx:104-106,183-195`
  **Description:** `renderOverlayRef` dereferences `analysisData.summary.resolution` unguarded inside an unconditional `requestAnimationFrame` loop with no error boundary — a payload missing `summary` (the worker's ML output is best-effort, unvalidated) throws once and silently kills the animation loop forever.
  **Acceptance Criteria:**
  - [ ] `summary`/`resolution` access null/undefined-guarded with sane fallbacks; a malformed payload no longer permanently halts the render loop.

- [ ] **[BE-06] Make rate limiting serverless-safe — verify before scheduling**
  **Target File(s):** `backend/src/middleware/rateLimiter.js`, `backend/src/config/redis.js`
  **Description:** `express-rate-limit`'s default in-memory store resets per-instance on Vercel cold starts. **Likely already resolved** — `redis.js`/`rateLimiter.js` appear to already have a working Redis-backed store with a fail-open wrapper. Confirm `REDIS_URL` is actually set in the Vercel production env before treating this as open work; if it's set, close this ticket outright.

#### Performance & Cost Engineering

- [ ] **[WK-10] Reuse loaded models across warm containers instead of reloading per request**
  **Target File(s):** `worker/app.py:188-201`
  **Description:** `BadmintonInference(...)` — loading TrackNetV3, both RCNNs, YOLO11x-pose, and the LSTM/HitNet/BST checkpoints onto the GPU — is instantiated inline on every single invocation instead of Modal's `@modal.enter()` warm-container pattern. Re-reads every weight file and repopulates GPU memory from scratch even when the container is already warm. Quantifiable win (latency + GPU-second cost) — good benchmarked-before/after story.
  **Acceptance Criteria:**
  - [ ] Converted to a `modal.Cls`-based endpoint with model loading in `@modal.enter()`.
  - [ ] Verified via Modal logs/timing that a warm-container request skips full model reload.

- [ ] **[FE-15] Add route-level code splitting**
  **Target File(s):** `frontend/badminton-ai/src/App.tsx:1-9`
  **Description:** All pages statically imported — an anonymous landing-page visitor downloads `firebase/auth`, `firebase/firestore`, `motion`, `radix-ui`, and the analysis page's canvas/SVG overlay code, none of which the landing page needs. Quantifiable bundle-size win.
  **Acceptance Criteria:**
  - [ ] Routes converted to `React.lazy` + `Suspense`; verified via build output that the landing page no longer pulls in the analysis-page bundle.

#### Testing & CI Maturity

- [ ] **[REPO-05] Make CI actually enforce the existing test suites**
  **Target File(s):** `.github/workflows/ci.yml`
  **Description:** `backend-checks` only runs `npm install` (stale "once we have backend tests!" comment) despite 32+ Jest tests existing; there's no worker/Python CI job at all despite 47 pytest tests; `frontend-checks` never runs `npm run build`. A PR that breaks any of these currently merges to `main` green — nothing is actually gating merges today, including recent ones.
  **Acceptance Criteria:**
  - [ ] `backend-checks` runs `npm test`; new `worker-checks` job runs `pytest worker/tests/`; `frontend-checks` also runs `npm run build`; all required on `main`.

- [ ] **[FE-17] Stand up a frontend test suite**
  **Target File(s):** `frontend/badminton-ai/package.json`, new `frontend/badminton-ai/src/**/*.test.tsx`
  **Description:** Zero automated frontend tests, unlike backend (Jest, 32 tests) and worker (pytest, 47 tests).
  **Acceptance Criteria:**
  - [ ] Vitest + React Testing Library added with a working `npm test` script; initial coverage on `result.ts`, `shotUtils.ts`/`timeUtils.ts`/`retry.ts`, `useAnalysisData`'s error/retry paths; CI runs it (coordinate with REPO-05).

- [ ] **[WK-16] Add test coverage for hit-merging and rule-based classification fallback**
  **Target File(s):** `worker/pipeline.py:488-603,609-665,787-854`, `worker/tests/`
  **Description:** The wrist-velocity pose-hit detector, the trajectory/pose cross-validation merge, and the rule-based shot-type fallback — the actual runtime path whenever learned models are unavailable — have zero test coverage, unlike the rest of `pipeline.py`.
  **Acceptance Criteria:**
  - [ ] Mirror-style tests cover `_merge_hits`'s confirmed/solo bucketing + debounce, and `_classify_shot_rules`'s decision boundaries.

- [ ] **[BE-15] Add test coverage for the real Express router/DI wiring**
  **Target File(s):** `backend/src/routes/videoRoutes.js`, `backend/test/unit/*.test.js`
  **Description:** Existing tests build a bare hand-mocked Express app and never import the real `videoRoutes.js` — the actual DI wiring and middleware ordering (`authMiddleware`/`uploadLimiter`) has zero coverage; a dropped middleware would pass every existing test.
  **Acceptance Criteria:**
  - [ ] A supertest suite imports the real `src/app.js` and exercises `/api/videos/*` end-to-end, verifying middleware is actually applied.

#### ML Evaluation & Benchmarking

_(This is the core of the resume-metrics work — see the 2026-08-18 audit note above for full context.)_

- [ ] **[EVAL-01] Build a held-out shot-classifier accuracy eval against ShuttleSet**
  **Target File(s):** new `worker/train/evaluate_classifier.py`, reuses `worker/train/features_v3/split.txt`, `ShuttleSet/set/*.csv`, `ShuttleSet/set/homography.csv`, `.bst-ref/validate_bst.py` (reference only)
  **Description:** No proper held-out eval exists — the only precedent (`validate_bst.py`) is a single hardcoded ~22s window, not a benchmark. Everything needed already exists in the repo (the 34/5/4 train/val/test split, per-stroke ground truth, homography for pixel→meter conversion).
  **Acceptance Criteria:**
  - [ ] Coordinated with **WK-19**: the 6-vs-12-class taxonomy decision determines what "correct" means for scoring.
  - [ ] Runs over all held-out test matches (not one window), on the classifier that actually ships in production.
  - [ ] Per-class confusion matrix, not just overall accuracy.
  - [ ] Exact command/checkpoint hash/commit recorded for reproducibility.
  - [ ] Explicitly does not cite the old "76%" figure from `validate_bst.py` — that number isn't statistically meaningful (single window, no held-out guarantee) and shouldn't appear anywhere external until this script replaces it. *(absorbs former EVAL-04)*

- [ ] **[EVAL-02] Decide what "hit-detection precision/recall" means, then measure it**
  **Target File(s):** `worker/train/evaluate_detector.py` (existing, CNN-only), new script for the heuristic path if pursued
  **Description:** The learned `HitDetectorCNN` is what actually ships (`pipeline.py:311`) and already has a legitimate held-out eval (the "93% P/R" figure) — just re-run and record it for citation. The heuristic dual-signal fallback has zero P/R measurement and mostly doesn't run in production; measuring it is an ablation, not the shipped number.
  **Acceptance Criteria:**
  - [ ] Re-run `evaluate_detector.py`, record command/checkpoint hash/commit.
  - [ ] If the heuristic path specifically is wanted: a separate script, explicitly labeled "fallback/ablation," not the headline metric.

- [ ] **[EVAL-03] Build a homography reprojection-error eval**
  **Target File(s):** new `worker/train/evaluate_homography.py`, `worker/pipeline.py:36`, `ShuttleSet/set/homography.csv`
  **Description:** No accuracy measurement exists for court-keypoint detection. ShuttleSet's `homography.csv` already has the ground truth needed (real court corners + reference matrix per match) — cheapest of the three eval scripts to build.
  **Acceptance Criteria:**
  - [ ] Runs over the same held-out test matches as EVAL-01/02.
  - [ ] Reports error in meters (what `location_m` actually consumes downstream), not just pixels.
  - [ ] Notes the 2.5x coordinate-space conversion explicitly.

- [ ] **[EVAL-05] Instrument end-to-end processing time so it's a queryable number**
  **Target File(s):** `worker/app.py:99`
  **Description:** Measuring upload→done time today requires manually diffing Modal dashboard timestamps — no `runningAt` is ever written. Note: **WK-10** means models currently reload from scratch every invocation, so a naive benchmark will conflate cold-load time with actual processing time; report both.
  **Acceptance Criteria:**
  - [ ] A duration number is queryable from Firestore/Modal logs without manual correlation; model-load and per-video processing time reported separately.

### 🧹 Tier 2 — Worth Doing, Low Individual Signal (batched)

_Real fixes, just not the kind that make an interview story on their own. Batched so they don't crowd out Tier 1 — tackle a batch in one sitting when you want a break from the bigger items._

- [ ] **[BATCH-01] Backend defensive hardening** *(was BE-10, BE-12, BE-13, BE-18)*
  - Stop `VideoController` reaching through `VideoService` into the Repository directly (`.repo` access) — add a proper service method. *(BE-10)*
  - Key the upload rate limiter by authenticated `uid`, not IP. *(BE-12)*
  - Validate required storage/webhook env vars at boot, fail fast like `config/firebase.js` already does. *(BE-13)*
  - Cap/sanitize client-supplied filename before use in S3 key / Firestore title. *(BE-18)*

- [ ] **[BATCH-02] Baseline security headers** *(was BE-16, BE-17)*
  - Add an explicit CORS origin allowlist + `helmet()`. *(BE-16)*
  - Pass `checkRevoked=true` to `verifyIdToken`. *(BE-17)*

- [ ] **[BATCH-03] Worker failure-path hardening** *(was WK-11, WK-12, WK-14, WK-15)*
  - Handle Modal's hard timeout so jobs don't get stuck `"running"` forever. *(WK-11)*
  - Validate the full webhook payload together so a missing key can't bypass the failure write via a bare `KeyError`. *(WK-12)*
  - Map internal exceptions to user-safe messages before writing to Firestore's `error` field (still log the raw one). *(WK-14)*
  - Make the failure-path Firestore update resilient to a nonexistent doc (`set(merge=True)`). *(WK-15)*

- [ ] **[BATCH-04] Worker & eval housekeeping** *(was WK-13, WK-17, EVAL-06, REPO-06 script half)*
  - Clean up `/tmp` files in a `finally` block. *(WK-13)*
  - Pin worker dependencies; reconsider `force_build=True`. *(WK-17)*
  - Add a `requirements-eval.txt` for `pandas`/`decord`/`ultralytics` so EVAL-0x scripts are reproducible off this machine. *(EVAL-06)*
  - Fix `worker/scripts/list_files.py`'s `E2_*` vs `R2_*` env var drift + hardcoded example ID. *(REPO-06, script half only — see Close list for the `render.yaml` half)*

- [ ] **[BATCH-05] UI consistency & accessibility** *(was FE-08, FE-10, FE-13, FE-16)*
  - Fix `LiveTracker`'s shot colors drifting from the shared `shotUtils.ts` palette — same shot type renders differently on the Rally Map vs. every other panel. *(FE-08)*
  - Surface an explicit "failed" state on `AnalysisPage` instead of showing "Processing…" forever. *(FE-10)*
  - Add keyboard accessibility to the timeline scrubber, shot-log/rally-log rows, and upload dropzone. *(FE-13)*
  - Pause the canvas rAF loop when the video is paused. *(FE-16)*

- [ ] **[BATCH-06] Frontend code-consistency** *(was FE-12, FE-14)*
  - Use the shared `Result<T,E>` from `src/lib/result.ts` in `videoService.ts` instead of redefining it. *(FE-12)*
  - Wire up the ignored "Full name" field on signup (`updateProfile` is never called). *(FE-14)*

### 🗑️ Flagged to Close

_Recommend closing these outright rather than scheduling them — reasons below._

| Ticket | Why close it |
|---|---|
| **FE-11** | `useUserVideos`, `VideoCard`, `ShotHeatmap` are unused anywhere in the app (confirmed by grep). Don't fix the bugs living inside dead code — `git rm` the three files. Five-minute close, not a ticket. |
| **WK-18** | Pure style: the confidence cutoff (`0.25`) and `FRAME_H` (`288.0`) are both already functionally correct today. Naming them changes zero observable behavior — no reliability or resume value. |
| **BE-07** | Ops task (delete `render.yaml`, click "delete" in the Render dashboard), not code. Do it whenever Vercel's stability is confirmed — doesn't need to occupy a backlog slot. |
| **REPO-06** *(render.yaml half)* | Only matters for the Render deployment BE-07 is about to tear down — fixing env var names on a service you're about to delete is wasted effort. *(The `list_files.py` half is still real — folded into BATCH-04.)* |
| **EVAL-04** | Not independent engineering work — "don't cite an unvalidated number" is an acceptance criterion of EVAL-01, not separate effort. Folded in there. |