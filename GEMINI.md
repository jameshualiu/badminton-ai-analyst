# GEMINI.md - Badminton AI Project Instructions

This file provides foundational mandates and context for Gemini CLI when working on the Badminton AI project.

## Project Overview
Badminton AI is a full-stack application for analyzing badminton match videos.
- **Frontend:** React 19 + TypeScript + Vite 7 + TailwindCSS 4 (located in `frontend/badminton-ai/`)
- **Backend:** Node.js + Express 5 (located in `backend/`)
- **Database/Auth:** Firebase (Firestore + Firebase Auth)
- **Storage:** IDrive E2 (S3-compatible storage for video uploads and AI artifacts)

## Building and Running

### Backend
- **Location:** `backend/`
- **Install Dependencies:** `npm install`
- **Development:** `npm run dev` (starts with `nodemon`)
- **Production:** `npm start`
- **Environment Variables:** Requires a `.env` file with `PORT`, `FIREBASE_PROJECT_ID`, `E2_BUCKET_NAME`, etc.

### Frontend
- **Location:** `frontend/badminton-ai/`
- **Install Dependencies:** `npm install`
- **Development:** `npm run dev` (Vite)
- **Build:** `npm run build`
- **Lint:** `npm run lint`
- **Environment Variables:** Requires `.env.local` with `VITE_API_BASE_URL` and Firebase config.

## Architecture & Conventions

### Backend (CommonJS)
The backend follows a **Controller-Service-Repository** pattern with Dependency Injection.
- **`server.js`**: Entry point. Handles dependency injection and route registration.
- **`src/controller/`**: Handles HTTP requests, extracts parameters, and calls services.
- **`src/service/`**: Contains business logic, manages external integrations (E2/S3), and orchestrates repository calls.
- **`src/repository/`**: Directly interacts with Firestore.
- **`src/middleware/authMiddleware.js`**: Validates Firebase ID tokens sent in the `Authorization: Bearer <token>` header.
- **Naming:** CamelCase for files and classes (e.g., `VideoService.js`). Use async/await for all IO.

### Frontend (ESM / TypeScript)
- **Framework:** React 19 with functional components and hooks.
- **Styling:** TailwindCSS 4 using `@/components/ui` (Shadcn pattern).
- **Features:** Logic is organized by feature (e.g., `src/features/analysis/`).
- **Data Fetching:** 
  - Writes/Actions: Handled via specialized services (e.g., `videoService.ts`) calling the Express API.
  - Reads: Uses `onSnapshot` for real-time Firestore updates where appropriate (e.g., `useUserVideos.ts`).
- **API Helper:** Use the `api<T>` helper in feature services to handle authenticated requests to the backend.

## Development Mandates

1.  **Strict Typing:** Use TypeScript for all frontend code. Avoid `any`. Define interfaces for API responses.
2.  **Auth Flow:** Always pass the user's ID token from `auth.currentUser.getIdToken()` to backend API calls.
3.  **Error Handling:** 
    - **Backend:** Controllers should catch errors and return appropriate HTTP status codes.
    - **Frontend:** Services should throw meaningful errors for components to handle.
4.  **Surgical Edits:** When modifying existing logic, preserve the established patterns (e.g., don't move repository logic into a controller).
5.  **Environment:** Never hardcode credentials. Use environment variables.
6.  **Dependency Injection:** When adding new services/repositories, register them in `backend/server.js`.

## Feature Implementation Checklist
1.  **Define Types:** Add any new data structures to `frontend/.../types.ts`.
2.  **Repository:** Implement Firestore access in `backend/src/repository/`.
3.  **Service:** Implement logic in `backend/src/service/`.
4.  **Controller:** Create endpoints in `backend/src/controller/` and register in `server.js`.
5.  **Frontend Service:** Add the corresponding API method in `frontend/.../videoService.ts`.
6.  **UI:** Implement the component and hook into the state.
7.  **Verify:** Run `npm run lint` and verify end-to-end (upload -> process -> result).
