# Badminton AI Analyst

A full-stack platform for analyzing badminton match videos using computer vision. This project provides automated shuttlecock tracking, court geometry detection, and player stroke classification.

## Tech Stack

- Frontend: React 19, TypeScript, Vite
- Backend: Node.js, Express 5
- Database: Firebase Firestore
- Storage: IDrive E2 (S3-compatible)
- Infrastructure: Docker, Docker Compose

## Quick Start

### 1. Requirements
- Docker Desktop
- Node.js 20+

### 2. Setup
Clone the repository and create the following environment files:
- backend/.env
- frontend/badminton-ai/.env.local

### 3. Run with Docker
Execute the following command in the root directory:
```bash
docker compose up --build
```
The application will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
