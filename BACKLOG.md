# Project Backlog — Badminton AI Analyst

Organized into four tracks: repo/documentation hygiene, backend, frontend, and worker.

Recommended starting point: **BE-06** — make rate limiting serverless-safe (the in-memory store resets per serverless instance on Vercel). **BE-07** (tear down Render) is deferred a few days to confirm the Vercel backend stays stable before removing the fallback.

**2026-07-31 full-codebase audit** (BE-08 through REPO-06 below) surfaced higher-urgency items than the above two — in particular **WK-06/WK-07** (the Modal worker webhook has no authentication and trusts `videoId`/`videoE2Key` without validation — anyone with the URL can trigger processing against arbitrary Firestore docs/storage keys) and **WK-09** (videos are silently truncated to ~60-72s, a functional/product bug, not just a hygiene issue). Recommend triaging the new High-priority items (BE-08/09, FE-06/07/08, WK-06/07/08/09, REPO-05) before continuing down the BE-06/07 track.

> Note while auditing: **BE-06 looks like it may already be implemented** — `backend/src/config/redis.js` + `backend/src/middleware/rateLimiter.js` contain a working Redis-backed store with a fail-open wrapper, gated on `REDIS_URL`. Worth confirming `REDIS_URL` is actually set in the Vercel production env before moving this ticket to DONE.

**2026-08-18 evaluation-readiness audit** (**WK-19**, **EVAL-01** through **EVAL-06** below) — triggered by wanting to cite real, defensible model-performance numbers on a resume rather than guessed ones. Headline finding: **WK-19** is a previously-undocumented production correctness bug, not just an eval gap — the BST stroke classifier (the most accurate model, apparently already deployed per prior session notes) emits a 12-class vocabulary that doesn't match the product's advertised 6-class taxonomy (Clear/Smash/Drop/Drive/Net/Lob), so ~7 of its 12 classes render as unlabeled grey dots/bars in the UI today. Fix that first — it also blocks a clean shot-classifier accuracy number. Separately, the codebase is in much better eval shape than expected: **ShuttleSet is already fully integrated locally** (153 stroke-level CSVs + `homography.csv` ground-truth court corners + 43 of 44 real match videos, all gitignored/local-only — see EVAL-06), and a proper held-out-set harness already exists and has already produced one real, reproducible number (`worker/train/evaluate_detector.py` → HitDetectorCNN 93% event-level P/R). The BST "76%" figure floating in prior notes is **not** resume-defensible as-is — it comes from `.bst-ref/validate_bst.py`, a one-off script hardcoded to a single ~22-second rally window on one machine. See EVAL-01/04 before citing it anywhere.

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

- [x] **[WK-05] Correct hitter location & shuttle-in-court filtering**
  **Target File(s):** `worker/pipeline.py`, `worker/tests/test_hitter_location.py` (new), `worker/tests/test_shuttle_in_court.py` (new)
  **Description:** Rescued a previously-unmerged fix (stranded on a local-only branch) for rally-map shot-location accuracy: `_shuttle_in_court` uses a perspective-correct quad test with proportional x-padding (was y-bounds only); `_player_sort_key` orders by homography-derived court-y to match BST's Top/Bottom convention; and new `_refine_locations_by_side` re-derives each hit's `location_m` from BST's reliable full-sequence `side`. Cherry-picked onto `main` (resolved conflicts against WK-01's BST fallback + WK-03's derived dims); 13 new mirror tests + full worker suite (37) pass. Merged via [PR #19](https://github.com/jameshualiu/shuttleye/pull/19). Still recommended: a prod e2e re-run on a real video (the sort-order change affects BST's input).

- [x] **[FE-05] Add light-mode variants for hover/border/mockup styling**
  **Target File(s):** `frontend/badminton-ai/src/styles/tailwind.css`, `frontend/badminton-ai/src/components/Navbar.tsx`, `frontend/badminton-ai/src/features/analysis/components/VideoCard.tsx`, `frontend/badminton-ai/src/pages/DashboardPage.tsx`, `frontend/badminton-ai/src/pages/LandingPage.tsx`
  **Description:** Rescued a previously-unmerged frontend fix (stranded on a local-only branch) filling light-mode styling gaps: `dark:` variants so dark-only hover/border/red-text styles render visibly in light mode, a refined `.theme-ai-saas` light palette (pearl-grey background, softer border), and a `.mockup-dark` class on the landing-page app-preview panels so they stay dark regardless of site theme. Cherry-picked onto `main` (auto-merged cleanly around REPO-04/FE-03; FE-03's video-chrome tokens verified intact); lint (0 errors) + build pass. Merged via [PR #20](https://github.com/jameshualiu/shuttleye/pull/20).

---

## TODO

### ⚙️ Backend (Node/Express)

- [ ] **[BE-06] Replace in-memory rate-limit store for serverless correctness**
  **Target File(s):** `backend/src/middleware/rateLimiter.js`, `backend/src/config/redis.js`, `backend/package.json`
  **Impact vs. Effort:** Medium Impact / Medium Effort
  **Description:** Follow-up surfaced by BE-05 — `express-rate-limit` uses its default in-memory store, which on Vercel serverless is per-instance and resets on every cold start, so neither the global (100/15min) nor the upload (10/30min) limit is enforced consistently across concurrent/ephemeral instances. The limiter won't error, it just stops being an effective control. Swap the in-memory store for a shared backing store (e.g. Upstash Redis via `rate-limit-redis`, which fits Vercel's serverless model) so limits hold across instances. Not a blocker for the migration; do it after BE-05 lands.

- [ ] **[BE-07] Decommission Render after Vercel cutover is verified**
  **Target File(s):** `render.yaml`, Render dashboard (tear down the web service)
  **Impact vs. Effort:** Low Impact / Low Effort
  **Description:** Follow-up to BE-05, gated on the Vercel backend being confirmed stable in production — keep the Render service live as a fallback during cutover, don't rip it out early. Once verified: delete `render.yaml` and tear down the Render web service. Docs need no changes (only `render.yaml` references the platform; `data-flow.md`/`CLAUDE.md`/`README.md` don't name Render).

- [ ] **[BE-08] Fix `/complete` leaving jobs permanently stuck at "queued" on failure**
  **Target File(s):** `backend/src/controller/VideoController.js` (`finalizeUpload`, lines 38-75)
  **Priority:** High
  **Description:** If the `repo.getVideo(userId, videoId)` read inside `finalizeUpload`'s try block rejects, the outer catch (lines 73-75) only logs — it never calls `markFailed`. If `videoData`/`videoData.input`/`videoData.input.e2Key` is missing, the `if` block is silently skipped with the same result: no webhook call, no failure recorded. In both cases the client still receives `{ status: 'queued' }`, so the Firestore doc has no path forward and no visible error — it sits at `queued` forever. `VideoController.test.js` covers the missing-`e2Key` case only for "fetch isn't called," never for the doc being marked failed.
  **Acceptance Criteria:**
  - [ ] If `repo.getVideo` rejects, the doc is marked `failed` via `service.markFailed` instead of only being logged.
  - [ ] If `videoData`/`videoData.input`/`videoData.input.e2Key` is missing, the doc is marked `failed` with a descriptive error instead of silently staying `queued`.
  - [ ] A new test covers `repo.getVideo` rejecting and asserts `markFailed` is called.
  - [ ] A new test covers the missing-`e2Key` branch asserting `markFailed` is called (not just that the webhook fetch isn't triggered).

- [ ] **[BE-09] Add idempotency guard to `/complete` to prevent duplicate Modal (GPU) triggers**
  **Target File(s):** `backend/src/controller/VideoController.js:25-78`, `backend/src/service/VideoService.js:42-46`
  **Priority:** High
  **Description:** `completeUpload` unconditionally sets `status: 'queued'` and the controller unconditionally fires the Modal webhook, with no check of the doc's current status first. A double-click, a client retry-on-timeout, or a replayed request all fire the T4 GPU trigger twice for the same video — wasting real compute spend and creating a race where two worker runs concurrently write results for the same `videoId`.
  **Acceptance Criteria:**
  - [ ] `completeUpload`/`finalizeUpload` checks the doc's current `status` before transitioning to `queued` and firing the webhook.
  - [ ] A second call to `/complete` for a video already in `queued`/`running`/`done` is a no-op (or returns the existing status) and does not fire a second webhook.
  - [ ] Test coverage added for the double-submit case.

- [ ] **[BE-10] Stop `VideoController` from reaching through `VideoService` into the Repository**
  **Target File(s):** `backend/src/controller/VideoController.js:39`
  **Priority:** Medium
  **Description:** `const videoData = await this.service.repo.getVideo(userId, videoId);` bypasses `VideoService` entirely, violating the `Controller → Service → Repository` layering CLAUDE.md documents, and depends on `VideoService` exposing `.repo` as a public field (an implementation detail, not an intended API).
  **Acceptance Criteria:**
  - [ ] Add a `VideoService` method (e.g. `getVideoRecord(userId, videoId)`) that wraps the repository call.
  - [ ] `VideoController.finalizeUpload` calls the new service method instead of `this.service.repo.getVideo(...)`.
  - [ ] `VideoController` no longer accesses `this.service.repo` anywhere.

- [ ] **[BE-11] Validate upload metadata (`contentType`, `size`, `filename`)**
  **Target File(s):** `backend/src/controller/VideoController.js:12-22`, `backend/src/service/VideoService.js:14-39`
  **Priority:** Medium
  **Description:** `initUpload` only checks truthiness. `size` can be negative/non-numeric and is stored as-is; `contentType` is never checked against a video-MIME allowlist, so a client can mint a presigned PUT for arbitrary content types; there's no upper bound on `size` and no `content-length-range` condition on the presigned URL, so actual uploaded bytes can differ arbitrarily from what's recorded, with no cap on storage-cost abuse.
  **Acceptance Criteria:**
  - [ ] `contentType` is validated against an allowlist of accepted video MIME types before a presigned URL is minted.
  - [ ] `size` is validated as a positive number under a defined maximum (matching the "up to 2GB" claim on the landing page).
  - [ ] The presigned upload enforces a `content-length-range` (e.g. via `createPresignedPost`) so actual uploaded bytes can't exceed the declared/allowed size.
  - [ ] Requests failing validation return 400 with a clear message; tests cover each rejected case.

- [ ] **[BE-12] Key the upload rate limiter by authenticated user, not IP**
  **Target File(s):** `backend/src/middleware/rateLimiter.js:110-120`, `backend/src/routes/videoRoutes.js:22-23`
  **Priority:** Medium
  **Description:** `uploadLimiter` runs after `authMiddleware` (so `req.user.uid` is available) but still uses `express-rate-limit`'s default IP-based `keyGenerator`. The comment in the file explicitly frames this as per-user protection, but users behind shared IPs (corporate NAT, mobile CGNAT) share one bucket, while an attacker rotating IPs isn't throttled per-account at all.
  **Acceptance Criteria:**
  - [ ] `uploadLimiter` uses a `keyGenerator` based on `req.user.uid` (falling back to IP only when unauthenticated).
  - [ ] Test confirms two different IPs sharing the same authenticated user share one rate-limit bucket, and two different users on the same IP do not.

- [ ] **[BE-13] Validate required storage/webhook env vars at startup**
  **Target File(s):** `backend/src/config/r2.js:4-11`, `backend/src/app.js`
  **Priority:** Medium
  **Description:** `src/config/firebase.js` validates its required vars and throws a clear boot-time error if missing. `r2.js` does the opposite — `S3Client` is constructed with possibly-`undefined` endpoint/keys, and `R2_BUCKET_NAME`/`MODAL_WEBHOOK_URL` are read inline with no check anywhere. The app boots successfully with broken storage config and only fails on the first real request as an opaque 500.
  **Acceptance Criteria:**
  - [ ] At boot, the app asserts `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, and `MODAL_WEBHOOK_URL` are set, following the pattern already used in `config/firebase.js`.
  - [ ] A missing var throws a clear startup error naming the missing variable.

- [ ] **[BE-14] Add a timeout to the outbound fetch to the Modal webhook**
  **Target File(s):** `backend/src/controller/VideoController.js:44-52`
  **Priority:** Medium
  **Description:** The `fetch()` call to `MODAL_WEBHOOK_URL` has no `AbortSignal`/timeout. If Modal's endpoint hangs, the promise never settles, so the `.catch` that calls `markFailed` never runs — combined with BE-08's dead-end paths, and on Vercel, `waitUntil` can only keep the promise alive up to the function's own execution budget before it's abandoned with no failure ever recorded.
  **Acceptance Criteria:**
  - [ ] The `fetch()` call includes `AbortSignal.timeout(...)` (e.g. 10s).
  - [ ] A timeout is treated the same as a non-OK response: `service.markFailed` is called with a descriptive error.
  - [ ] Test coverage added for the timeout path.

- [ ] **[BE-15] Add test coverage for the real Express router/DI wiring**
  **Target File(s):** `backend/src/routes/videoRoutes.js`, `backend/test/unit/*.test.js`
  **Priority:** Medium
  **Description:** `VideoController.test.js` builds its own bare Express app with a hand-mocked service and never imports `videoRoutes.js`; `app.test.js` mounts the real app but only ever hits `/api/health/firestore`. The actual `VideoRepository → VideoService → VideoController` construction and real route bindings (including `authMiddleware`/`uploadLimiter` ordering) have zero test coverage — a typo'd path or dropped middleware would pass every existing test.
  **Acceptance Criteria:**
  - [ ] A new supertest suite imports the real `src/app.js` and exercises `/api/videos/*` routes end-to-end (mocking only `firebase-admin`/S3 client at the boundary).
  - [ ] The suite verifies `authMiddleware` and `uploadLimiter` are actually applied to the expected routes in the real router.

- [ ] **[BE-16] Harden baseline HTTP posture (CORS allowlist + security headers)**
  **Target File(s):** `backend/src/app.js:18`, `backend/package.json`
  **Priority:** Low
  **Description:** `app.use(cors())` with no options allows every origin. No `helmet` (or equivalent) is applied, so standard headers (`X-Content-Type-Options`, `Strict-Transport-Security`, `X-Frame-Options`, etc.) are absent. Low risk today (auth is Bearer-token, not cookie-based), but both are cheap to fix.
  **Acceptance Criteria:**
  - [ ] `cors()` is configured with an explicit origin allowlist (production frontend URL + local dev origin).
  - [ ] `helmet()` is added to the Express middleware chain.
  - [ ] A test confirms a disallowed origin doesn't receive `Access-Control-Allow-Origin`.

- [ ] **[BE-17] Check token revocation on JWT verification**
  **Target File(s):** `backend/src/middleware/authMiddleware.js:13`
  **Priority:** Low
  **Description:** `admin.auth().verifyIdToken(token)` is called without `checkRevoked=true`. A token revoked via "sign out all devices" or an admin disabling a compromised account remains valid here until its natural ≤1-hour expiry.
  **Acceptance Criteria:**
  - [ ] `admin.auth().verifyIdToken(token, true)` is used.
  - [ ] The added per-request Firestore-lookup cost this incurs is noted in a comment.

- [ ] **[BE-18] Sanitize client-supplied filename before use in S3 key / Firestore title**
  **Target File(s):** `backend/src/service/VideoService.js:16,29`
  **Priority:** Low
  **Description:** The client-supplied filename is used verbatim in `e2Key` and Firestore `title` with no length cap or character restriction — risking an S3 key-length error or Firestore field-size error surfacing as an opaque 500 instead of a clean 400.
  **Acceptance Criteria:**
  - [ ] Filename length is capped (e.g. 255 chars) and control characters are stripped/rejected before use.
  - [ ] A test covers an oversized/malformed filename being rejected or sanitized rather than causing a raw storage/DB error.

### 🎨 Frontend (React/TS)

- [ ] **[FE-06] Fix upload getting permanently stuck at ~90% on ID-token failure**
  **Target File(s):** `frontend/badminton-ai/src/pages/DashboardPage.tsx:134-138`, `frontend/badminton-ai/src/features/analysis/components/UploadModal.tsx:82-99`
  **Priority:** High
  **Description:** `user.getIdToken()` is awaited outside any try/catch in `handleUpload`, even though the function's return type promises a `Result`. `UploadModal.handleUploadClick` also has no try/catch around `onUpload()`. If token refresh fails (revoked session, offline, throttling), the promise rejects instead of resolving to `{ ok: false }`: the fake progress interval is never cleared and the modal freezes at ~90% with no retry path short of closing the dialog.
  **Acceptance Criteria:**
  - [ ] `handleUpload`'s `getIdToken()` call is wrapped in try/catch and returns an `Err` result on failure.
  - [ ] `UploadModal.handleUploadClick` handles a thrown/rejected `onUpload()` and transitions to the error state.
  - [ ] Manually verified: simulating a token failure shows the modal's error state with a retry option.

- [ ] **[FE-07] Enforce real client-side file validation on upload**
  **Target File(s):** `frontend/badminton-ai/src/features/analysis/components/UploadModal.tsx:78-80`
  **Priority:** High
  **Description:** `handleFile` only checks the browser-reported (spoofable, sometimes empty) MIME type, with no file-size check at all despite the landing page advertising "up to 2 GB." A rejected file fails silently (no toast/error); an oversized file begins uploading to E2 before any server-side limit can reject it.
  **Acceptance Criteria:**
  - [ ] A file-size cap matching the advertised limit is enforced before upload begins.
  - [ ] Type checking considers both MIME type and file extension.
  - [ ] A rejected file shows a visible error message instead of silently no-op'ing.

- [ ] **[FE-08] Fix drifted shot-type colors between LiveTracker and the rest of the app**
  **Target File(s):** `frontend/badminton-ai/src/features/analysis/components/LiveTracker.tsx:22-34`, `frontend/badminton-ai/src/utils/shotUtils.ts:1-9`
  **Priority:** High
  **Description:** `shotUtils.ts` defines the canonical shot-color map used by `AnalysisPage`, `ShotLog`, `VideoTimeline`, `ShotStatsTab`, `CourtHeatmap` (e.g. `Smash: "#e63946"`). `LiveTracker.tsx` independently redeclares its own `SHOT_COLORS` with different hex values (`Smash: "#ef4444"`, `Clear: "#60a5fa"` vs. the shared `"#89c2d9"`, etc.) — verified by direct comparison. The same shot type renders in visibly different colors on the Rally Map panel vs. every other panel on the same page, for the same match.
  **Acceptance Criteria:**
  - [ ] `LiveTracker.tsx`'s local `SHOT_COLORS`/`shotColor` is removed.
  - [ ] `LiveTracker` imports and uses the shared color map from `src/utils/shotUtils.ts`.
  - [ ] Visually verified: the same shot type renders the same color on every panel for the same match.

- [ ] **[FE-09] Guard against malformed `analysis.json` freezing the canvas render loop**
  **Target File(s):** `frontend/badminton-ai/src/features/analysis/types.ts:34-40`, `frontend/badminton-ai/src/features/analysis/hooks/useAnalysisData.ts:70-75`, `frontend/badminton-ai/src/pages/AnalysisPage.tsx:104-106,183-195`
  **Priority:** Medium
  **Description:** `AnalysisData.summary` is typed as required/non-nullable, but the worker's `analysis.json` is best-effort ML output with no runtime validation applied to the fetched JSON. `renderOverlayRef` dereferences `analysisData.summary.resolution` unguarded inside an unconditional `requestAnimationFrame` loop with no error boundary in reach — a payload missing `summary` throws once and the animation loop silently stops forever.
  **Acceptance Criteria:**
  - [ ] `summary`/`resolution` access in `renderOverlayRef` is null/undefined-guarded with sane fallbacks.
  - [ ] A malformed/partial `analysis.json` no longer permanently halts the render loop.
  - [ ] Verified (test or manual repro) that the overlay degrades gracefully instead of throwing silently inside the rAF loop.

- [ ] **[FE-10] Surface "failed" processing status on AnalysisPage**
  **Target File(s):** `frontend/badminton-ai/src/pages/AnalysisPage.tsx`, `frontend/badminton-ai/src/features/analysis/components/ShotLog.tsx:101`, `frontend/badminton-ai/src/features/analysis/components/ShotStatsTab.tsx:114,182`
  **Priority:** Medium
  **Description:** `ShotLog`/`ShotStatsTab` render `status === "done" ? … : "Processing…"`, so a `"failed"` job displays identically to an in-progress one — inconsistent with `UploadModal.tsx`, which does show an explicit error banner for `"failed"` while the modal is open. A user who closes the modal or opens the analysis link later sees a page that looks like it's still working forever.
  **Acceptance Criteria:**
  - [ ] `AnalysisPage` renders an explicit failed-state UI when the video's status is `"failed"`.
  - [ ] `ShotLog`/`ShotStatsTab` receive and use the real status so `"failed"` no longer displays the same copy as `"Processing…"`.

- [ ] **[FE-11] Remove or fix dead/duplicated components (`useUserVideos`, `VideoCard`, `ShotHeatmap`)**
  **Target File(s):** `frontend/badminton-ai/src/features/analysis/hooks/useUserVideos.ts`, `frontend/badminton-ai/src/features/analysis/components/VideoCard.tsx`, `frontend/badminton-ai/src/features/analysis/components/ShotHeatmap.tsx`
  **Priority:** Medium
  **Description:** None of these three are imported anywhere in the app (verified by grep). Each has also drifted from its live counterpart and grown its own bugs: `useUserVideos`'s `onSnapshot` has no error callback (unlike the inline query it duplicates in `DashboardPage`); `VideoCard`'s delete action is a non-interactive `<div onClick>` with no confirm and no keyboard access (unlike `DashboardPage`'s own delete button); `ShotHeatmap` uses an off-theme purple gradient and ships a hardcoded, unlabeled `fallbackShotData` that would render as if real if ever wired up.
  **Acceptance Criteria:**
  - [ ] Each file is either deleted (confirmed unused via grep) or wired up and fixed (error handling, keyboard access, theme consistency, removal of unlabeled fallback data, as applicable).
  - [ ] `npm run build` and `npm run lint` pass with no dangling imports.

- [ ] **[FE-12] Apply the `Result<T,E>` convention consistently in `videoService.ts`**
  **Target File(s):** `frontend/badminton-ai/src/features/analysis/videoService.ts:10-12,111-123`
  **Priority:** Medium
  **Description:** The file redefines its own `Result<T,E>` type instead of importing `src/lib/result.ts`'s, and only `createAndUploadVideo` follows the Result pattern end-to-end — `getVideoResults` and `deleteVideo` throw `ApiError` directly. Current callers happen to wrap both in try/catch, but the module's own contract is inconsistent with the codebase's stated convention, and a future caller mirroring the file's dominant pattern is likely to forget the try/catch.
  **Acceptance Criteria:**
  - [ ] `videoService.ts` imports `Result` from `src/lib/result.ts` instead of redefining it.
  - [ ] `getVideoResults` and `deleteVideo` return `Result<T, ApiError>` consistent with `createAndUploadVideo`.
  - [ ] Callers updated to branch on the returned `Result`.

- [ ] **[FE-13] Add keyboard accessibility to primary video-navigation controls**
  **Target File(s):** `frontend/badminton-ai/src/features/analysis/components/VideoTimeline.tsx:43-47`, `frontend/badminton-ai/src/features/analysis/components/ShotLog.tsx:58-70`, `frontend/badminton-ai/src/pages/AnalysisPage.tsx:506-514`, `frontend/badminton-ai/src/features/analysis/components/UploadModal.tsx:118-131`
  **Priority:** Medium
  **Description:** The timeline scrub bar, shot-log rows, and rally-log rows are all plain `<div onMouseDown>`/`<div onClick>` with no `role`, `tabIndex`, or key handling — none of the three primary ways to navigate a match analysis are keyboard-operable. `UploadModal`'s dropzone has `role="button" tabIndex={0}` but no `onKeyDown`, so it can receive focus but Enter/Space do nothing.
  **Acceptance Criteria:**
  - [ ] The timeline scrubber is keyboard-operable (focusable, arrow keys seek).
  - [ ] Shot-log and rally-log rows are focusable and activatable via Enter/Space.
  - [ ] `UploadModal`'s dropzone responds to Enter/Space.

- [ ] **[FE-14] Apply the "Full name" field on sign-up**
  **Target File(s):** `frontend/badminton-ai/src/pages/SignUpPage.tsx:12,31-40,95`
  **Priority:** Medium
  **Description:** The `name` state captured from the "Full name" input is never used — `handleEmailSignUp` calls `signUpWithEmail(email, password)` only, never `updateProfile`. Every email/password signup ends up with `displayName: null`, so the navbar always falls back to an email-derived label.
  **Acceptance Criteria:**
  - [ ] `updateProfile(cred.user, { displayName: name })` is called after successful signup (or `name` is threaded through `signUpWithEmail`).
  - [ ] Manually verified: a new account shows the entered name in the navbar instead of the email prefix.

- [ ] **[FE-15] Add route-level code splitting**
  **Target File(s):** `frontend/badminton-ai/src/App.tsx:1-9`
  **Priority:** Low
  **Description:** All pages are statically imported with no `React.lazy`/`Suspense`. An anonymous visitor on the marketing landing page downloads the same bundle that includes `firebase/auth`, `firebase/firestore`, `motion`, `radix-ui`, and the analysis page's canvas/SVG overlay code — none of which the landing page needs.
  **Acceptance Criteria:**
  - [ ] Route components are converted to `React.lazy` with a `Suspense` boundary in `App.tsx`.
  - [ ] Verified via build output/network tab that the landing page no longer downloads the analysis-page/Firestore bundle up front.

- [ ] **[FE-16] Pause the canvas overlay redraw loop when video is paused**
  **Target File(s):** `frontend/badminton-ai/src/pages/AnalysisPage.tsx:183-195`
  **Priority:** Low
  **Description:** The `requestAnimationFrame` loop driving the canvas overlay runs forever once mounted, with no check against `videoRef.current.paused` — an idle analysis page left open keeps redrawing 60x/sec indefinitely.
  **Acceptance Criteria:**
  - [ ] The rAF loop checks `videoRef.current.paused` and stops scheduling further frames while paused.
  - [ ] `play`/`pause` event listeners resume/stop the loop appropriately.

- [ ] **[FE-17] Stand up a frontend test suite**
  **Target File(s):** `frontend/badminton-ai/package.json`, new `frontend/badminton-ai/src/**/*.test.tsx`
  **Priority:** Medium
  **Description:** Unlike the backend (Jest) and worker (pytest), the frontend has zero automated tests — no test script, no test framework in `devDependencies`. `ci.yml`'s frontend job only runs lint + `tsc -b`.
  **Acceptance Criteria:**
  - [ ] A test framework (e.g. Vitest + React Testing Library) is added with a working `npm test` script.
  - [ ] Initial coverage added for the highest-risk logic: `src/lib/result.ts`, `src/utils/shotUtils.ts`/`timeUtils.ts`/`retry.ts`, and `useAnalysisData`'s error/retry paths.
  - [ ] CI runs the new test script (coordinate with REPO-05).

### 🐍 Worker (Python ML pipeline)

- [ ] **[WK-06] Authenticate the Modal webhook endpoint**
  **Target File(s):** `worker/app.py:56-63`, `backend/src/controller/VideoController.js:44-52`
  **Priority:** High
  **Description:** `process_badminton_video` is a plain `@modal.fastapi_endpoint(method="POST")` with no auth check in the function body and no token gate on the decorator. The backend's webhook call sends only `Content-Type: application/json` — no shared secret, no signature. Modal endpoint URLs are public HTTPS URLs; anyone who obtains the URL can POST `{videoId, userId, videoE2Key}` directly, flipping any user's Firestore doc to `"running"`, burning GPU minutes, and overwriting that doc's results with attacker-controlled data.
  **Acceptance Criteria:**
  - [ ] The worker validates a shared secret (HMAC signature or static bearer token from `modal.Secret`) before touching Firestore/S3, rejecting unauthenticated requests.
  - [ ] The backend's webhook call sends the required credential.
  - [ ] `data-flow.md` documents that the webhook is now authenticated.

- [ ] **[WK-07] Validate `videoE2Key`/`videoId` before use (ownership + path traversal)**
  **Target File(s):** `worker/app.py:61-63,148,151,205`
  **Priority:** High
  **Description:** `video_e2_key` is passed straight into `s3.download_file` with no check that it's prefixed `uploads/{userId}/…` — combined with WK-06, an attacker can supply any object key in the bucket alongside their own ids. Separately, the attacker-controlled `video_id` is interpolated unsanitized into local filesystem paths (`/tmp/{video_id}.mp4`, `/tmp/{video_id}_analysis.json`); a `videoId` containing `../` sequences risks writing files outside `/tmp`.
  **Acceptance Criteria:**
  - [ ] `video_e2_key` is validated to start with `uploads/{user_id}/` before being passed to `s3.download_file`.
  - [ ] `video_id` is validated as a well-formed UUID (or otherwise sanitized) before being used in any `/tmp` path.
  - [ ] A malformed/mismatched key or id is rejected with a clear error before any download/processing begins.

- [ ] **[WK-08] Use `weights_only=True` for model checkpoint loads**
  **Target File(s):** `worker/detectors/tracknet_v3.py:201,213`, `worker/detectors/court_detector.py:11,291`
  **Priority:** High
  **Description:** The RCNN court/net detector and TrackNetV3/InpaintNet loaders use `torch.load(..., weights_only=False)`, which unpickles arbitrary Python objects — a known RCE vector if the checkpoint is ever tampered with. These come from a Modal Volume with an R2 fallback and no checksum/signature verification. `worker/detectors/stroke_classifier.py:112` already correctly uses `weights_only=True`, showing the safer pattern is known but applied inconsistently. The process holding these credentials also has R2 and Firebase-admin service-account access, so a compromised checkpoint is a path to credential theft.
  **Acceptance Criteria:**
  - [ ] `torch.load(..., weights_only=True)` is used everywhere the checkpoint is (or can be re-saved as) a plain state dict.
  - [ ] Where `weights_only=False` is still genuinely required, a pinned checksum is verified on the R2-fallback download path as a stopgap.

- [ ] **[WK-09] Stop silently truncating videos longer than ~60-72s**
  **Target File(s):** `worker/pipeline.py:236,241`, `worker/app.py:202`
  **Priority:** High
  **Description:** `process_video(..., limit_frames=1800)` hard-caps every video at 1800 frames (~60-72s at typical fps), called with no override from `app.py`. Any longer match is silently analyzed only up to that point — `totalShots`, `shotCounts`, `tracking` all reflect just the truncated prefix, with no `truncated` flag anywhere in the payload and no mention of this limit in `data-flow.md`. A user uploading a multi-minute match gets a plausible-looking but silently incomplete result.
  **Acceptance Criteria:**
  - [ ] `limit_frames` is removed or raised to reflect the real constraint (the 20-minute Modal timeout), not an arbitrary 1800-frame cap.
  - [ ] If truncation occurs for any reason, `analysis.json`'s `summary` includes `truncated: true`.
  - [ ] The frontend surfaces a visible notice when `truncated` is true.
  - [ ] `data-flow.md` documents the real processing-length constraint.

- [ ] **[WK-10] Reuse loaded models across warm containers instead of reloading per request**
  **Target File(s):** `worker/app.py:188-201`
  **Priority:** Medium
  **Description:** `BadmintonInference(...)` — which loads TrackNetV3, both keypoint RCNNs, YOLO11x-pose, and the LSTM/HitNet/BST checkpoints onto the GPU — is instantiated inline inside the request handler on every single invocation. Modal's documented pattern for this is a class-based function with `@modal.enter()` so expensive setup runs once per container lifetime; this app re-reads every weight file and repopulates GPU memory from scratch even on an already-warm container, adding latency and wasted GPU-second billing to every job.
  **Acceptance Criteria:**
  - [ ] `process_badminton_video` is converted to a `modal.Cls`-based endpoint with model loading moved into `@modal.enter()`.
  - [ ] Verified (via Modal logs/timing) that a second request to an already-warm container skips full model reload.

- [ ] **[WK-11] Handle Modal's hard timeout so jobs don't get stuck at "running" forever**
  **Target File(s):** `worker/app.py:54,97-226`
  **Priority:** Medium
  **Description:** `timeout=1200` is set on the Modal function, but nothing is timeout-aware — there's no heartbeat/checkpoint. If Modal hard-kills the container on timeout rather than the process raising a catchable exception, the `except` block that would flip status to `"failed"` never runs, and the Firestore doc (and the frontend's real-time UI) stays on `"running"` indefinitely.
  **Acceptance Criteria:**
  - [ ] A mechanism exists (internal deadline check that proactively marks `failed` before the hard kill, or a documented monitoring/cleanup process) so a video that would exceed the timeout doesn't leave an orphaned `running` doc indefinitely.

- [ ] **[WK-12] Validate the full webhook payload before it can bypass the failure path**
  **Target File(s):** `worker/app.py:61-63,95,97`
  **Priority:** Medium
  **Description:** `video_id`/`user_id`/`video_e2_key` are read via direct dict indexing before the `try:` block starts. If `videoE2Key` is missing while `videoId`/`userId` are present, the `KeyError` on line 63 is raised before `video_doc_ref` is even constructed (line 95), so no Firestore failure write ever happens — the job silently stays at whatever status the backend last set.
  **Acceptance Criteria:**
  - [ ] All three required payload keys are validated together, inside (or immediately guarded by) the try block that has access to `video_doc_ref`.
  - [ ] A payload missing any required key results in an explicit Firestore `failed` write (where a doc can be identified) or a clear 4xx response, not a bare unhandled `KeyError`.

- [ ] **[WK-13] Clean up `/tmp` files on success and failure**
  **Target File(s):** `worker/app.py:148,205-207`
  **Priority:** Medium
  **Description:** The downloaded video and generated results JSON are written to `/tmp` and never deleted on either the success or failure path. Modal containers can be reused across invocations, so on a warm container serving several videos in sequence, temp files accumulate without bound, risking disk exhaustion that fails unrelated later jobs.
  **Acceptance Criteria:**
  - [ ] The downloaded video and results JSON are removed from `/tmp` in a `finally` block regardless of outcome.
  - [ ] Verified no temp files persist after a request completes (success or exception) on a warm container.

- [ ] **[WK-14] Don't expose raw internal exception strings to end users**
  **Target File(s):** `worker/app.py:225`, `frontend/badminton-ai/src/features/analysis/components/UploadModal.tsx:50`
  **Priority:** Medium
  **Description:** On failure, `video_doc_ref.update({"status": "failed", "error": str(e)})` stores the raw Python exception (could name a bucket, an internal `/tmp` path, or a torch/CUDA stack fragment), and the frontend displays it verbatim (`snap.data()?.error`). This leaks internal infrastructure details and is poor UX (tracebacks instead of actionable messages).
  **Acceptance Criteria:**
  - [ ] Internal exceptions are mapped to a small set of user-safe messages before being written to Firestore's `error` field.
  - [ ] The full raw exception is still logged in worker logs for debugging.

- [ ] **[WK-15] Make the failure-path Firestore update resilient to a nonexistent doc**
  **Target File(s):** `worker/app.py:97-99,223-226`
  **Priority:** Medium
  **Description:** If the initial `.update({"status": "running"})` fails because the doc doesn't exist (e.g. a bogus id pair per WK-07, or a doc deleted mid-flight), the `except` block immediately tries `.update({"status": "failed", ...})` on the same nonexistent document, raising a second unhandled exception and producing an opaque 500 instead of graceful failure logging.
  **Acceptance Criteria:**
  - [ ] The failure-path write uses `set(..., merge=True)` (or is itself wrapped in try/except) so it succeeds even if the document doesn't exist.

- [ ] **[WK-16] Add test coverage for hit-merging and rule-based classification fallback**
  **Target File(s):** `worker/pipeline.py:488-603` (`_detect_hits_from_pose`), `:609-665` (`_merge_hits`), `:787-854` (`_classify_shot_rules`), `worker/tests/`
  **Priority:** Medium
  **Description:** `worker/tests/` covers court/shuttle geometry, coordinate scaling, and BST/LSTM load-fallback — verified to faithfully mirror current `pipeline.py` logic. But the wrist-velocity pose-hit detector, the trajectory/pose cross-validation merge, and the rule-based shot-type fallback — the actual runtime path whenever learned models are unavailable — have zero test coverage.
  **Acceptance Criteria:**
  - [ ] New mirror-style tests (matching the existing `worker/tests/` pattern) cover `_merge_hits`'s confirmed/solo-traj/solo-pose bucketing and debounce logic.
  - [ ] New tests cover `_classify_shot_rules`'s threshold branches (Clear/Lob/Smash/Drive/Drop/Net decision boundaries).

- [ ] **[WK-17] Pin worker dependencies and reconsider `force_build=True`**
  **Target File(s):** `worker/requirements.txt:1-12`, `worker/app.py:23-28`
  **Priority:** Low
  **Description:** Most of `requirements.txt` (`numpy<2` aside) has no version pins, and `force_build=True` disables Modal image-layer caching, forcing a full rebuild every deploy. Each deploy can silently pull different transitive versions than the last verified-working build — a real "worked yesterday, broke today" risk for a GPU pipeline this sensitive to exact library behavior.
  **Acceptance Criteria:**
  - [ ] All runtime dependencies in `requirements.txt` are pinned to exact versions.
  - [ ] `force_build=True` is removed once pins are in place (or scoped to deliberate rebuild-and-verify cycles only).

- [ ] **[WK-18] Name/derive remaining hardcoded thresholds in the fallback paths**
  **Target File(s):** `worker/pipeline.py:209` (confidence `0.25`), `worker/pipeline.py:802` (`FRAME_H = 288.0`)
  **Priority:** Low
  **Description:** Unlike the file's other thresholds (already promoted to named constants), the legacy-TrackNet confidence cutoff is still an inline literal. Separately, `_classify_shot_rules`'s `FRAME_H = 288.0` reintroduces the exact hardcoded-resolution risk that WK-03 removed elsewhere in this file — it isn't threaded through from the now-measured `SD_H`.
  **Acceptance Criteria:**
  - [ ] The legacy-TrackNet confidence cutoff is hoisted to a named constant alongside the file's other thresholds.
  - [ ] `_classify_shot_rules`'s `FRAME_H` is derived from the measured `SD_H` (per the WK-03 pattern) instead of hardcoded.

- [ ] **[WK-19] Reconcile BST's 12-class stroke vocabulary with the product's 6-class taxonomy**
  **Target File(s):** `worker/detectors/stroke_classifier.py:33-52,204-215` (`MERGED_TYPES_ZH`, `TYPE_EN`, `classify_hits`), `frontend/badminton-ai/src/utils/shotUtils.ts`, `frontend/badminton-ai/src/features/analysis/components/ShotStatsTab.tsx:17-20`
  **Priority:** High
  **Description:** When the BST classifier is loaded (weights present locally at `worker/weights/bst_stroke_classifier.pt`, and per prior session notes already measured/integrated — verify it's actually resolved in the production Modal Volume before treating this as live), `classify_hits` assigns `hit["type"]` from `TYPE_EN`, a **12-class** vocabulary: `Net Drop, Block, Smash, Lift, Clear, Drive, Drop, Push, Net Kill, Cross-court Net, Short Serve, Long Serve` (plus `Unknown`). The rule-based fallback (`_classify_shot_rules`) and the frontend's `SHOT_COLORS` map both assume a **6-class** taxonomy: `Clear, Drive, Drop, Lob, Net, Smash` (plus `Unknown`). Only 5 of BST's 12 classes overlap; the other 7 (`Net Drop, Block, Lift, Push, Net Kill, Cross-court Net`, both serve types) have no entry in `SHOT_COLORS`, so `shotColor()`'s `?? SHOT_COLORS.Unknown` fallback renders them as unlabeled grey dots/bars on the rally map and shot-stats chart, and `ShotStatsTab.tsx:17-20`'s `shotTypes` filter list (derived from `Object.keys(SHOT_COLORS)`) never offers them as a filter option — verified by direct comparison of `TYPE_EN`'s values against `SHOT_COLORS`'s keys, with no remapping code found anywhere in `worker/` or `frontend/` (grepped). The backend `shotCounts` dict itself is unaffected (`Counter(h["type"] for h in hits)` in `pipeline.py:332` stores whatever string BST returns), so no data is lost — but the two flagship UI surfaces (rally map, shot-stats bars) silently mis-render for any match with net play, pushes, or serves, which is most real rallies. This also blocks a clean shot-classifier accuracy claim: ShuttleSet's ground truth is 18 raw Chinese types merging to BST's 12; the product's public-facing taxonomy is 6. An accuracy number needs a decided, documented mapping before it means anything.
  **Acceptance Criteria:**
  - [ ] Decide and document one taxonomy: either (a) collapse BST's 12 classes to the product's 6 (e.g. `Net Drop/Net Kill/Cross-court Net → Net`, `Lift → Lob`, `Push/Block → Drive`, serves → `Drive`/`Net`/excluded — needs a real tactical-accuracy judgment call, not just naming), or (b) expand `SHOT_COLORS`/the frontend to natively support all 12 classes with real colors and filter entries.
  - [ ] Verify whether BST is actually resolved (not silently falling back to LSTM/rule-based) in the live Modal Volume today, since that determines how urgent this is in production right now.
  - [ ] Confirmed via a real `analysis.json` sample (or a BST run) that every emitted `type` string now renders with a real color and is filterable in `ShotStatsTab`.

### 📊 ML Evaluation & Benchmarking

_(Audited 2026-08-18 to scope real, citable model-performance numbers. Priority order below is also the recommended execution order.)_

- [ ] **[EVAL-01] Build a held-out shot-classifier accuracy eval against ShuttleSet**
  **Target File(s):** new `worker/train/evaluate_classifier.py` (mirrors `worker/train/evaluate_detector.py`'s structure), reuses `worker/train/features_v3/split.txt`, `ShuttleSet/set/*.csv`, `ShuttleSet/set/homography.csv`, `.bst-ref/validate_bst.py` (as a working reference, not to be run as-is)
  **Priority:** High — this is the actual "what's my shot-classifier accuracy" number
  **Description:** No proper held-out eval exists today. The only precedent, `.bst-ref/validate_bst.py`, hardcodes one match (`Viktor_Axelsen_Ng_Ka_Long_Angus...`), one ~650-frame (~22s) window, and an absolute `C:\Users\james\...` path — it's a smoke test, not a benchmark (single window, ~12-20 strokes, no train/test split awareness). Everything needed to build a real one already exists in the repo: `worker/train/features_v3/split.txt` has an existing 34/5/4 train/val/test match split (already used by `evaluate_detector.py` — reuse the same 4 held-out test matches for consistency, but first verify BST's own training data used the same split, or the "held-out" set is contaminated); ShuttleSet's `set{1,2,3}.csv` files have per-stroke `type`/`frame_num`/`player` ground truth; `homography.csv` has per-match court corners for pixel→meter conversion; `validate_bst.py` already shows the full loading/scaling code for trajectory features, YOLO pose extraction, and the ShuttleSet Chinese-type merge map. Generalize `validate_bst.py` into a loop over the held-out test matches (not one hardcoded window), report per-class precision/recall/F1 and overall accuracy, and decide how services are handled (excluded, like hit detection's ground truth, or scored).
  **Acceptance Criteria:**
  - [ ] Blocked on / coordinated with **WK-19**: decide the 6-vs-12-class taxonomy question first, since it determines what "correct" means for scoring.
  - [ ] Script runs over all held-out test matches (not one window), on the actual classifier that ships in production (BST if resolved, else LSTM, else rule-based — report which).
  - [ ] Output includes a per-class confusion matrix, not just overall accuracy — merged/ambiguous classes (e.g. `點扣`→`殺球`) will otherwise hide systematic misclassification.
  - [ ] The exact command, checkpoint file (with hash), git commit, and match list used are recorded somewhere citable (commit message, or a short results file) so the number can be reproduced later.

- [ ] **[EVAL-02] Decide what "hit-detection precision/recall" means, then measure it**
  **Target File(s):** `worker/train/evaluate_detector.py` (existing, CNN-only), new eval script for the heuristic path if pursued (`pipeline.py:351` `_detect_hits_from_traj`, `:488` `_detect_hits_from_pose`, `:609` `_merge_hits`)
  **Priority:** High
  **Description:** Two different things could be meant by "hit detection accuracy," and only one is currently measured: (1) **the learned `HitDetectorCNN`** (`hit_detector_v3.onnx`) — this is what actually runs in production whenever its weights resolve (`pipeline.py:311`, confirmed: the heuristic dual-signal path is the fallback, only used `if hits is None`), and it already has a real, reproducible, held-out-set eval (`evaluate_detector.py`, event-level P/R with a tolerance window, serves excluded from ground truth) — this is the "93% P/R" figure and it's legitimate; just re-run it and record the exact command/checkpoint/commit for citation. (2) **The heuristic dual-signal approach** (trajectory-gap reversal + wrist-velocity, cross-validated in `_merge_hits`) you asked about specifically — this has **zero** precision/recall measurement anywhere; `worker/tests/test_direction_reversal.py` only unit-tests the reversal-gate math on synthetic vectors, not real labeled data. Since it's a fallback path that mostly doesn't run in production (only when the CNN's weights fail to resolve), measuring it is useful as an ablation/fallback-quality check, not as "the" production hit-detection number.
  **Acceptance Criteria:**
  - [ ] For a resume-citable number: re-run `evaluate_detector.py` on the current checkpoint, record the command/checkpoint hash/commit (this is already legitimate — no new code needed).
  - [ ] If the heuristic path specifically is wanted: build an analogous script that runs `_detect_hits_from_traj`/`_detect_hits_from_pose`/`_merge_hits` directly (not the CNN) against the same ShuttleSet ground truth and tolerance-window matching logic, framed explicitly as "fallback-path" or "ablation" numbers, not the shipped metric.

- [ ] **[EVAL-03] Build a homography reprojection-error eval**
  **Target File(s):** new `worker/train/evaluate_homography.py`, `worker/pipeline.py:36` (`setup_homography`), `ShuttleSet/set/homography.csv`
  **Priority:** High — cheapest of the three to build, ground truth already loaded elsewhere in the repo
  **Description:** No accuracy measurement exists for court-keypoint detection or the resulting perspective transform. `setup_homography()` scans the first 150 frames for 6 RCNN-detected court keypoints and computes `cv2.findHomography(quad, TARGET_CORNERS)` in 512×288 pixel space. ShuttleSet's `set/homography.csv` has exactly the needed ground truth per match: real court corner pixel coordinates (in 1280×720 annotation space — 2.5x the pipeline's 512×288, `validate_bst.py:42` already shows the `×2.5`/`÷2.5` scaling) plus a precomputed reference homography matrix. Build a script that runs the actual pipeline's `detect_geometry()`/`setup_homography()` against a first-frame or annotated frame from each held-out ShuttleSet test video, transforms both the RCNN-detected corners and known real-world court reference points (0,0 / 6.1,0 / 6.1,13.4 / 0,13.4) through each homography, and reports mean/max reprojection error in both pixels and meters across the test set.
  **Acceptance Criteria:**
  - [ ] Script runs over the same held-out test matches as EVAL-01/02 for consistency.
  - [ ] Reports error in meters (not just pixels), since `location_m` — the value actually consumed downstream by shot placement/rally-map/footwork features — is what the error should be expressed in terms of.
  - [ ] Explicitly notes the coordinate-space conversion (2.5x) so a future reader doesn't silently compare pixel spaces incorrectly.

- [ ] **[EVAL-04] Stop citing the BST "76%" figure until EVAL-01 produces a real number**
  **Target File(s):** n/a (process/documentation ticket)
  **Priority:** Medium
  **Description:** The "BST strokes 76%" figure referenced in prior session notes traces to `.bst-ref/validate_bst.py` — a single hardcoded match, a single ~22-second/~650-frame rally window (~12-20 strokes), an absolute path tying it to one machine, living in a directory `CLAUDE.md` explicitly documents as vendored reference code "not part of the runtime path." A sample this small isn't statistically meaningful and isn't a held-out test (no guarantee that window's match wasn't part of BST's own training data). Don't put this number on a resume. HitDetectorCNN's "93% P/R," by contrast, comes from a legitimate held-out multi-match eval (`evaluate_detector.py`) and is fine to cite once re-run and recorded per EVAL-02.
  **Acceptance Criteria:**
  - [ ] Any accuracy figure cited externally traces to EVAL-01/02/03's harnesses, not `validate_bst.py`.

- [ ] **[EVAL-05] Instrument end-to-end processing time so it's a queryable number, not a manual log-diff**
  **Target File(s):** `worker/app.py:99` (`status: "running"` update), `worker/app.py` (no per-stage instrumentation currently)
  **Priority:** Medium
  **Description:** Today, measuring upload→done wall-clock time requires manually diffing Modal dashboard/log timestamps — `app.py:99`'s `status: "running"` update never writes a timestamp, only the final `status: "done"` update sets `updatedAt` (line 219); the Firestore schema's `progress: {stage, pct}` field (documented in `data-flow.md`) is never written by any code path. A rough number is measurable right now with zero code changes (Modal's dashboard shows function invocation duration directly). For a precise, repeatable, queryable number: write a `runningAt` timestamp alongside the existing `status: "running"` update. Separately — **WK-10** (already in the backlog) means models currently reload from scratch on every single invocation (no `@modal.enter()` warm-container reuse), so a naive back-to-back benchmark will conflate "cold model load" time with actual video-processing time; report both, or note which is being measured, since "processing time" on a resume implies the latter.
  **Acceptance Criteria:**
  - [ ] A duration number is queryable from Firestore/Modal logs without manual correlation.
  - [ ] Model-load time and per-video processing time are reported separately (or the benchmark explicitly states which it measured), given WK-10's cold-load-every-time behavior.

- [ ] **[EVAL-06] Document the local ML dev environment ShuttleSet/eval scripts depend on**
  **Target File(s):** new `worker/train/requirements-eval.txt` (or similar), `worker/requirements.txt`
  **Priority:** Low
  **Description:** `ShuttleSet/` (153 stroke-level CSVs, `homography.csv`, and 43 of 44 real match videos — confirmed present locally, ~9.3GB, entirely gitignored/local-only) and `worker/weights/` (all model checkpoints including `bst_stroke_classifier.pt`, `hit_detector_v3.onnx`, TrackNetV3) are both already fully present on this machine — not a blocker today. But `evaluate_detector.py`/`validate_bst.py`/any new EVAL-0x scripts depend on `pandas`, `decord`, and `ultralytics`, none of which are declared in `worker/requirements.txt` (that file is scoped to the Modal deploy image only) or anywhere else — they happen to already be installed locally (confirmed: `pandas` 3.0.0, `decord` 0.6.0), which is why nothing has surfaced this gap yet. Not reproducible on a fresh machine or in CI without guesswork.
  **Acceptance Criteria:**
  - [ ] A small `requirements-eval.txt` (or equivalent) declares `pandas`, `decord`, `ultralytics`, `torch` for anyone reproducing these eval numbers on a different machine.
  - [ ] `worker/train/extract_features.py`'s docstring (which separately notes `pandas`/`yt-dlp` as ad hoc training-only deps) is updated to point at the new file instead of a comment.

### 📦 Repo / Cross-cutting

- [ ] **[REPO-05] Make CI actually enforce the existing test suites**
  **Target File(s):** `.github/workflows/ci.yml`
  **Priority:** High
  **Description:** `backend-checks` only runs `npm install`, with a stale comment ("once we have backend tests!") — but the backend already has 32+ Jest tests (BE-04). There is no worker/Python job at all, despite `worker/tests/` having 37 test functions across 6 files. `frontend-checks` runs lint + `tsc -b` but never `npm run build` (or any tests — see FE-17). A PR that breaks any of these currently merges to `main` green.
  **Acceptance Criteria:**
  - [ ] `backend-checks` runs `npm test` (working-directory `backend`) and fails the job on test failure.
  - [ ] A new `worker-checks` job installs worker dependencies and runs `pytest worker/tests/`.
  - [ ] `frontend-checks` also runs `npm run build`.
  - [ ] All jobs are required checks on `main`.

- [ ] **[REPO-06] Fix stale `E2_*` vs `R2_*` storage env var naming**
  **Target File(s):** `render.yaml:9-27`, `worker/scripts/list_files.py:17-24,34`
  **Priority:** Medium
  **Description:** `render.yaml` declares `E2_ACCESS_KEY_ID`/`E2_SECRET_ACCESS_KEY`/`E2_REGION`/`E2_ENDPOINT`/`E2_BUCKET_NAME` and never declares `MODAL_WEBHOOK_URL` at all — but the actual code reads `R2_ENDPOINT`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET_NAME` (`backend/src/config/r2.js`, `.env.example`). If the Render blueprint is what provisions that service's env vars, every storage operation and the worker trigger would be running with `undefined` config on Render — the exact fallback BE-07 is deliberately keeping alive during Vercel cutover verification may already be broken. `worker/scripts/list_files.py` has the same `E2_*` naming drift plus a hardcoded example user/video ID.
  **Acceptance Criteria:**
  - [ ] `render.yaml`'s env var names match what the code reads, or `render.yaml` is removed outright if BE-07's decommission is fast-tracked instead.
  - [ ] `worker/scripts/list_files.py`'s env var names are aligned to `R2_*`.
  - [ ] The hardcoded example user/video ID prefix in `list_files.py` is parameterized instead of committed inline.