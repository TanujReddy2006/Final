# LearnForge

LearnForge is a self-contained corporate learning and certification MVP. It supports learner, training provider, HR, and admin workflows without external LMS or ONEST integrations.

## Stack

- React + Vite + React Router + Axios + Tailwind-ready styling
- Node.js + Express + JWT + bcrypt + Zod-ready validation boundary
- PostgreSQL + Prisma schema, Redis-ready verification cache boundary
- Docker Compose for PostgreSQL, Redis, and backend

## Run locally

1. Copy `.env.example` to `.env`.
2. Start infrastructure: `docker compose up -d postgres redis`.
3. Start the API: `npm install --prefix backend && npm run dev --prefix backend`.
4. Start the web app in a second terminal: `npm install --prefix frontend && npm run dev --prefix frontend`.
5. Open http://localhost:5173.

The MVP seeds an in-memory demo dataset so the application is usable immediately. The Prisma schema in `backend/prisma/schema.prisma` is the persistence contract for the PostgreSQL migration.

## Demo credentials

All demo accounts use password `Demo@123`: `learner@example.com`, `company@example.com`, `hr@example.com`, and `admin@example.com`.

## Core API

Auth: `/api/v1/auth/register`, `/login`, `/logout`, `/me`  
Catalog: `/api/v1/courses`, `/api/v1/enrollments`, `/api/v1/progress`  
Assessment and certification: `/api/v1/assessments`, `/api/v1/certifications`, `/api/v1/certificates`  
Verification: public `GET /api/v1/verify/:certificateId`  
Administration: `/api/v1/admin/overview`

See [docs/architecture.md](docs/architecture.md), [docs/database.md](docs/database.md), [docs/api.md](docs/api.md), [docs/security.md](docs/security.md), and [docs/testing.md](docs/testing.md).
