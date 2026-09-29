# BOOOM More

AI campaign workspace MVP.

- `frontend/`: Next.js 16 + Tailwind 4 (Vercel now; Docker image for AWS later)
- `backend/`: FastAPI + Postgres (Render now; Docker image for AWS later)
- `docs/`: client brief, our 3-week plan, reference screens

See `PROGRESS.md` for status.

## Run locally

1. Database: any local Postgres 17. See `backend/README.md` for the one-time setup.
   (`docker compose up -d db` also works if you'd rather not install Postgres.)
2. Backend: see `backend/README.md`, then run it on http://localhost:8000
3. Frontend:
   ```bash
   cd frontend
   cp .env.example .env.local
   npm install
   npm run dev
   ```
   Open http://localhost:3000

## How the pieces talk

The browser only calls the Next.js app. Requests to `/api/*` are forwarded to the backend
(`BACKEND_URL`, a rewrite in `next.config.ts`). This keeps the login cookie on one site, which
Safari needs, and means nothing changes in the browser code when the hosts change.

## Moving to AWS later

Both apps are plain Docker images configured only by environment variables:

- Frontend: `frontend/Dockerfile` (Next.js `standalone` output). Pass `BACKEND_URL` as a build arg.
- Backend: `backend/Dockerfile`. Runs migrations on start, listens on `$PORT`.
- Database: any Postgres (e.g. RDS). Set `DATABASE_URL`.
- Files: S3-compatible API (Supabase Storage now, S3 later). Set the `S3_*` variables.

No host-specific features are used.
