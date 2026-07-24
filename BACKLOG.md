# Project Backlog — Badminton AI Analyst

Organized into four tracks: repo/documentation hygiene, backend, frontend, and worker.

Recommended starting point: **REPO-01** — zero code risk, highest visibility-to-risk ratio of anything in this backlog.

---

## IN PROGRESS

_(none yet)_

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

- [x] **[REPO-04] Fix `react-refresh/only-export-components` lint error in `ThemeContext.tsx`**
  **Target File(s):** `frontend/badminton-ai/src/context/ThemeContext.tsx`, `frontend/badminton-ai/src/context/theme-context.ts` (new), `frontend/badminton-ai/src/context/useTheme.ts` (new)
  **Description:** CI lint was failing because `ThemeContext.tsx` exported both the `ThemeProvider` component and non-component values (the context object, the `useTheme` hook), which breaks Vite Fast Refresh boundaries. Split the context object into `theme-context.ts` and the `useTheme` hook into `useTheme.ts`, leaving `ThemeContext.tsx` exporting only the `ThemeProvider` component. Updated the three importers (`App.tsx`, `Navbar.tsx`, `LandingPage.tsx`).

---

## TODO

### 📁 Repo & Documentation

- [ ] **[REPO-01] Un-gitignore architecture docs**
  **Target File(s):** `.gitignore`, `data-flow.md`, `CLAUDE.md`
  **Impact vs. Effort:** High Impact / Low Effort
  **Description:** Remove `data-flow.md` and `CLAUDE.md` from `.gitignore` and commit them. They're currently the best-written artifacts in the repo and are invisible to anyone cloning it from GitHub.

- [ ] **[REPO-02] Remove orphaned root `package.json`**
  **Target File(s):** `package.json` (repo root), `package-lock.json` (repo root)
  **Impact vs. Effort:** Low Impact / Low Effort
  **Description:** A root-level `package.json` with a single stray `motion` dependency and no workspace config reads as leftover cruft; delete it or fold the dependency into the frontend where it's actually used.

- [ ] **[REPO-03] Relocate/exclude training artifacts**
  **Target File(s):** `worker/train/features_v3/*.npz`, `.bst-ref/`
  **Impact vs. Effort:** Medium Impact / Low-Medium Effort
  **Description:** 40+ committed `.npz` feature files and a reference-implementation folder bloat the repo; move to Git LFS, external storage, or `.gitignore`, but confirm nothing in `worker/train/*.py` depends on them being present at a fixed path before removing.

### 🎨 Frontend (React/TS)

- [ ] **[FE-02] Fix rAF-driven re-render thrash during video playback**
  **Target File(s):** `frontend/badminton-ai/src/pages/AnalysisPage.tsx` (lines ~656–668, `currentTime` state at ~480)
  **Impact vs. Effort:** High Impact / Low-Medium Effort
  **Description:** `setCurrentTime` fires every animation frame (~60fps) and re-renders the entire page tree (shot log, rally log, stat tiles). Isolate anything that needs `currentTime` into a small subscribed child so the 60Hz update no longer cascades through the whole component.

- [ ] **[FE-03] Extract magic numbers and inline `style={{}}` objects**
  **Target File(s):** `frontend/badminton-ai/src/features/analysis/components/CourtHeatmap.tsx` (`SVG_COURT`, `COURT_M`), `frontend/badminton-ai/src/pages/AnalysisPage.tsx` (hardcoded hex/rgba values throughout)
  **Impact vs. Effort:** Low Impact / Low Effort
  **Description:** Pull hardcoded court-SVG coordinates and repeated inline color/opacity styling into named constants or Tailwind theme tokens for consistency with the rest of the styling system. Note: as of FE-01, `SVG_COURT`/`COURT_M` now live in `CourtHeatmap.tsx` rather than `AnalysisPage.tsx`.

### 🧠 Worker (Python/Modal)

- [ ] **[WK-03] Derive HD/SD scale factors from actual reader dimensions**
  **Target File(s):** `worker/pipeline.py` (lines ~255–260)
  **Impact vs. Effort:** Medium Impact / Low Effort
  **Description:** Replace hardcoded `HD_W, HD_H, SD_W, SD_H = 1280, 720, 512, 288` with values read from `vr_hd`/`vr` at runtime, plus an assertion/log if the decord reader doesn't honor the requested resolution — prevents silent misalignment on unusual source aspect ratios.

- [ ] **[WK-04] Add test coverage for coordinate-scaling logic**
  **Target File(s):** new `worker/tests/test_coordinate_scaling.py`, mirroring `pipeline.py`'s `_scale_player` / `sx,sy` logic
  **Impact vs. Effort:** Medium Impact / Low Effort
  **Description:** The 512p↔720p scaling math currently has zero test coverage despite being flagged as the most fragile part of the pipeline; add unit tests mirroring `_scale_player` the same way `test_shuttle_in_court.py` mirrors court-bounds logic.
