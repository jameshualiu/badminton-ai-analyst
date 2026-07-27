# Project Backlog — Badminton AI Analyst

Organized into four tracks: repo/documentation hygiene, backend, frontend, and worker.

Recommended starting point: **BE-06** — tear down Render now that BE-05 (the Vercel migration) is verified in prod; **BE-07** is a follow-up to make rate limiting serverless-safe.

---

## IN PROGRESS

- [ ] **[WK-05] Correct hitter location & shuttle-in-court filtering**
  **Target File(s):** `worker/pipeline.py`, `worker/tests/test_hitter_location.py` (new), `worker/tests/test_shuttle_in_court.py` (new)
  **Description:** Rescues a previously-unmerged fix (was stranded on a local-only branch) for rally-map shot-location accuracy: `_shuttle_in_court` now uses a perspective-correct quad test with proportional x-padding instead of y-bounds only; `_player_sort_key` orders by homography-derived court-y (foot) to match BST's Top/Bottom convention; and new `_refine_locations_by_side` re-derives each hit's `location_m` from BST's reliable full-sequence `side` assignment instead of the single-frame hitter guess. Rebased onto current `main` (resolved conflicts against WK-01's BST fallback and WK-03's derived dims). 13 new mirror tests + full worker suite (37) pass. **PR [#19](https://github.com/jameshualiu/shuttleye/pull/19) open** — pending review/merge and a prod e2e re-run.

---

## DONE

- [x] **[FE-01] Break up `AnalysisPage.tsx` god-component**
  **Target File(s):** `frontend/badminton-ai/src/pages/AnalysisPage.tsx` (1,170 → 690 lines)
  **Description:** Extracted `CourtHeatmap` and `ShotStatsTab` into their own component files (`frontend/badminton-ai/src/features/analysis/components/`), and pulled Firestore/results-fetching logic into a `useAnalysisData` hook (`frontend/badminton-ai/src/features/analysis/hooks/`), leaving the page component as layout/composition only. Merged via [PR #3](https://github.com/jameshualiu/shuttleye/pull/3).

- [x] **[BE-01] Fix `VideoService` error-handling bypass**
  **Target File(s):** `backend/src/service/VideoService.js`
  **Description:** Replaced the two bare `throw new Error("Video not found")` calls in `getResultsUrls` and `deleteVideo` with `throw new AppError("Video not found", 404)`, so these now correctly return 404s instead of falling through `errorHandler.js` to a generic hidden 500 in production. Merged via [PR #4](https://github.com/jameshualiu/shuttleye/pull/4).

- [x] **[BE-02] Extract per-resource routers out of `server.js`**
  **Target File(s):** `backend/server.js`, `backend/src/routes/videoRoutes.js`
  **Description:** Moved the video resource's DI wiring (`VideoRepository` → `VideoService` → `VideoController`) and route bindings into a new `videoRoutes.js` router module, leaving `server.js` as a thin mount point (`apiRouter.use("/videos", videoRoutes)`). Merged via [PR #5](https://github.com/jameshualiu/shuttleye/pull/5).

- [x] **[BE-03] Replace ad-hoc `console.error` logging with structured logging**
  **Target File(s):** `backend/src/utils/logger.js` (new), `backend/src/controller/VideoController.js`, `backend/src/service/VideoService.js`, `backend/src/middleware/authMiddleware.js`, `backend/src/middleware/errorHandler.js`, `backend/package.json`
  **Description:** Added `pino` as a dependency and a shared `logger.js` utility, then swapped the emoji-prefixed `console.error` calls across the controller/service/middleware layers for structured logger calls with consistent levels. No behavior change. Merged via [PR #6](https://github.com/jameshualiu/shuttleye/pull/6).

- [x] **[BE-04] Stand up a backend test suite**
  **Target File(s):** `backend/package.json`, `backend/test/setup.js` (new), `backend/test/unit/*.test.js` (new)
  **Description:** Added `jest` + `supertest` devDependencies and replaced the `exit 1` stub with `"test": "jest"`. Added unit tests for `VideoRepository`, `VideoService`, `VideoController`, `authMiddleware`, and `errorHandler` — 32 tests across 5 suites, all against mocked Firestore/R2/Firebase (no real network or DB calls). `uuid` v13 is ESM-only and broke Jest's CJS parser, so it's mocked in tests rather than adding a Babel toolchain. PR: [#7](https://github.com/jameshualiu/shuttleye/pull/7).

- [x] **[WK-01] Add runtime fallback for BST stroke classifier failures**
  **Target File(s):** `worker/pipeline.py`, `worker/detectors/stroke_classifier.py`, `worker/tests/test_bst_fallback.py` (new)
  **Description:** Wrapped `bst_clf.classify_hits(...)` in try/except so a runtime failure falls back to the LSTM/rule-based classification path instead of failing the whole video job. Merged via [PR #8](https://github.com/jameshualiu/shuttleye/pull/8).

- [x] **[WK-02] Wrap LSTM (`shot_clf`) load in try/except for consistency**
  **Target File(s):** `worker/inference.py`, `worker/tests/test_lstm_load_fallback.py` (new)
  **Description:** Brought `ShotClassifierAdapter(lstm_path)` load in line with the other optional-model loads (`hit_detector_path`, `bst_path`, `tracknet_v3_path`) by wrapping it in try/except-with-warning, so a corrupt ONNX file degrades gracefully instead of crashing worker boot. Merged via [PR #9](https://github.com/jameshualiu/shuttleye/pull/9).

- [x] **[WK-03] Derive HD/SD scale factors from actual reader dimensions**
  **Target File(s):** `worker/pipeline.py`
  **Description:** Replaced hardcoded `HD_W, HD_H, SD_W, SD_H = 1280, 720, 512, 288` with values derived from the actual decoded frames of `vr_hd`/`vr` at runtime, and the analysis summary now reports the derived resolution instead of the old hardcoded constant. Merged via [PR #11](https://github.com/jameshualiu/shuttleye/pull/11).

- [x] **[WK-04] Add test coverage for coordinate-scaling logic**
  **Target File(s):** `worker/tests/test_coordinate_scaling.py` (new)
  **Description:** Added unit tests mirroring `_scale_player` and the `sx, sy = HD_W/SD_W, HD_H/SD_H` derivation from `pipeline.py` — covering nominal and non-uniform scale factors, malformed/empty box or skeleton input, unrelated-field preservation, and a round-trip (SD→HD→SD) identity check. PR: [#12](https://github.com/jameshualiu/shuttleye/pull/12).

- [x] **[REPO-04] Fix `react-refresh/only-export-components` lint error in `ThemeContext.tsx`**
  **Target File(s):** `frontend/badminton-ai/src/context/ThemeContext.tsx`, `frontend/badminton-ai/src/context/theme-context.ts` (new), `frontend/badminton-ai/src/context/useTheme.ts` (new)
  **Description:** CI lint was failing because `ThemeContext.tsx` exported both the `ThemeProvider` component and non-component values (the context object, the `useTheme` hook), which breaks Vite Fast Refresh boundaries. Split the context object into `theme-context.ts` and the `useTheme` hook into `useTheme.ts`, leaving `ThemeContext.tsx` exporting only the `ThemeProvider` component. Updated the three importers (`App.tsx`, `Navbar.tsx`, `LandingPage.tsx`).

- [x] **[FE-02] Fix rAF-driven re-render thrash during video playback**
  **Target File(s):** `frontend/badminton-ai/src/pages/AnalysisPage.tsx`, `frontend/badminton-ai/src/features/analysis/components/LiveTracker.tsx`, `frontend/badminton-ai/src/features/analysis/components/VideoTimeline.tsx` (new), `frontend/badminton-ai/src/features/analysis/components/ShotLog.tsx` (new), `frontend/badminton-ai/src/features/analysis/hooks/useCurrentTimeStore.ts` (new), `frontend/badminton-ai/src/utils/timeUtils.ts` (new)
  **Description:** Replaced the `useState`-driven `currentTime` (updated on every rAF tick during playback) with an external `useCurrentTimeStore` read via `useSyncExternalStore`, and extracted `VideoTimeline`/`ShotLog` components plus rewired `LiveTracker` to subscribe to it directly — so 60Hz playback ticks no longer re-render the shot log, rally log, and stat tiles. Merged via [PR #13](https://github.com/jameshualiu/shuttleye/pull/13).

- [x] **[FE-03] Extract magic numbers and inline `style={{}}` objects**
  **Target File(s):** `frontend/badminton-ai/src/features/analysis/components/CourtHeatmap.tsx`, `frontend/badminton-ai/src/pages/AnalysisPage.tsx`, `frontend/badminton-ai/src/features/analysis/components/VideoTimeline.tsx`, `frontend/badminton-ai/src/styles/tailwind.css`
  **Description:** Derived `CourtHeatmap`'s SVG geometry from `SVG_COURT` instead of hand-copied pixel coordinates, named the repeated canvas-draw and rally-log inline-style color literals in `AnalysisPage`, and added `--color-video-canvas`/`--color-video-chrome` Tailwind tokens to de-duplicate the hardcoded video-chrome hex shared between `AnalysisPage` and `VideoTimeline`. No visual change — verified each derived/tokenized value against the original literal. Merged via [PR #14](https://github.com/jameshualiu/shuttleye/pull/14).

- [x] **[REPO-01] Un-gitignore architecture docs & remove orphaned root `package.json`**
  **Target File(s):** `.gitignore`, `data-flow.md`, `CLAUDE.md`, `package.json` (repo root), `package-lock.json` (repo root)
  **Description:** Removed `CLAUDE.md`/`data-flow.md` from `.gitignore` and committed them, and deleted the orphaned root `package.json`/`package-lock.json` — their only dependency (`motion`) was already independently declared and actively used in `frontend/badminton-ai/package.json`, and nothing (including CI) referenced the root manifest. Merged via [PR #15](https://github.com/jameshualiu/shuttleye/pull/15).

- [x] **[REPO-02] Relocate/exclude training artifacts**
  **Target File(s):** `worker/train/features_v3/*.npz`, `.bst-ref/`
  **Description:** Investigated and found this was already resolved — both directories were added to `.gitignore` back in commit `0d08575` ("chore: update .gitignore, remove old design doc from repo") and have zero git history (`git log --all` returns nothing for either path), so nothing is actually committed to relocate or exclude. Confirmed `.npz` features are regenerable via `extract_features.py` and never referenced at a fixed path by runtime code (`worker/app.py`'s Modal deploy explicitly excludes `train/features_v3/**`), and confirmed `.bst-ref/` is vendored third-party reference code (TemPose paper implementation) that should stay untracked. No code change — this ticket needed no PR.

- [x] **[FE-04] Add retry/backoff and error-state UI to analysis results fetch**
  **Target File(s):** `frontend/badminton-ai/src/features/analysis/hooks/useAnalysisData.ts`, `frontend/badminton-ai/src/pages/AnalysisPage.tsx`, `frontend/badminton-ai/src/utils/retry.ts` (new)
  **Description:** Added an exponential-backoff `withRetry` helper and wrapped both the backend results call and the E2 `analysisJson` fetch in it, replacing the hook's duplicate inline fetch with the existing `getVideoResults()` (which also fixed the stale `/api/v1` fallback URL bug). `useAnalysisData` now exposes `resultsError`/`retryAnalysisData`, and `AnalysisPage` shows a visible error banner with a Retry button — visible on both the Overview and Shot Stats tabs — instead of silently leaving the shot log/rally map/stat tiles blank on a transient failure. Merged via [PR #16](https://github.com/jameshualiu/shuttleye/pull/16).

- [x] **[BE-05] Migrate backend from Render to Vercel serverless**
  **Target File(s):** `backend/src/app.js` (new), `backend/server.js`, `backend/api/index.js` (new), `backend/vercel.json` (new), `backend/src/controller/VideoController.js`, `backend/src/service/VideoService.js`, `backend/package.json`, `backend/test/unit/app.test.js` (new), `backend/test/unit/VideoController.test.js`, `backend/test/unit/VideoService.test.js`
  **Description:** Extracted the Express app into an importable `src/app.js` (no `listen()`), served on Vercel via an `api/index.js` serverless entry + catch-all `vercel.json` rewrite; `server.js` stays the local/Docker entry. Wrapped the fire-and-forget Modal webhook in `waitUntil()` from `@vercel/functions` (guarded by `process.env.VERCEL`) so serverless can't freeze the instance before the trigger + its `markFailed` error handling complete; added `trust proxy` and tests (`app.test.js` wiring + `waitUntil` behavior). Also dropped the ESM-only `uuid` dep for native `crypto.randomUUID()` — `require('uuid')` threw `ERR_REQUIRE_ESM` and crashed the function on Vercel's runtime (hidden locally by uuid-mocking tests). Merged via [PR #17](https://github.com/jameshualiu/shuttleye/pull/17) + uuid hotfix [PR #18](https://github.com/jameshualiu/shuttleye/pull/18). Verified end-to-end in production (health, JWT auth, R2 presign, webhook `queued→failed` transition, full upload via UI). Cutover also required adding the frontend's serving origin (`https://shuttleye.vercel.app`) to the E2/R2 bucket CORS allowlist — a latent config gap, not a code issue.

---

## TODO

### ⚙️ Backend (Node/Express)

- [ ] **[BE-06] Decommission Render after Vercel cutover is verified**
  **Target File(s):** `render.yaml`, Render dashboard (tear down the web service)
  **Impact vs. Effort:** Low Impact / Low Effort
  **Description:** Follow-up to BE-05, gated on the Vercel backend being confirmed stable in production — keep the Render service live as a fallback during cutover, don't rip it out early. Once verified: delete `render.yaml` and tear down the Render web service. Docs need no changes (only `render.yaml` references the platform; `data-flow.md`/`CLAUDE.md`/`README.md` don't name Render).

- [ ] **[BE-07] Replace in-memory rate-limit store for serverless correctness**
  **Target File(s):** `backend/src/middleware/rateLimiter.js`, `backend/package.json`
  **Impact vs. Effort:** Medium Impact / Medium Effort
  **Description:** Follow-up surfaced by BE-05 — `express-rate-limit` uses its default in-memory store, which on Vercel serverless is per-instance and resets on every cold start, so neither the global (100/15min) nor the upload (10/30min) limit is enforced consistently across concurrent/ephemeral instances. The limiter won't error, it just stops being an effective control. Swap the in-memory store for a shared backing store (e.g. Upstash Redis via `rate-limit-redis`, which fits Vercel's serverless model) so limits hold across instances. Not a blocker for the migration; do it after BE-05 lands.
