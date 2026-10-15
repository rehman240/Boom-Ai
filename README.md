# BOOOM More

AI campaign workspace (MVP). A user types in a business idea and is guided step by step to a
ready campaign package: brief, target audience, campaign direction, ad copy and other assets,
budget split, conversion tracking plan, and a PDF / Word export. The AI suggests, the user
decides. Nothing is published and no money is spent by the app.

- **Live app:** https://booom-more-k7q2x9m4w8z1p6t3r5v0n2.vercel.app
- **Live API:** https://boom-ai-rrdv.onrender.com (health check: `/health`)
- **Handover notes (accounts, settings, day-to-day running):** [`HANDOVER.md`](HANDOVER.md)
- **What was built, task by task:** [`PROGRESS.md`](PROGRESS.md)

## What is in the app

| Screen | What the user does |
| --- | --- |
| Landing | Sees the four capabilities, a sample output, then signs up |
| Overview | Creates, continues, renames, duplicates and deletes campaigns |
| Campaign brief | Fills in the business facts (autosaved), uploads a logo and reference files, confirms an AI summary of the facts |
| Identify target | Gets 2 to 4 audience cards, edits them, picks one, adds groups to leave out, or writes their own |
| Generate campaign | Compares 3 directions, chooses and edits one, regenerates one at a time, with history |
| Creative workspace | 7 assets (overview, landing page outline, short and long ad copy, email, social post, visual production brief). Edit, regenerate one field, save and restore versions, copy, approve |
| Allocate budget | Channel split with amounts and percentages, lock a channel and the rest rebalances, total always equals the budget, production costs kept separate |
| Manage conversions | Goal, landing page, tracking checklist, review schedule, manual spend / leads / sales / revenue with simple results (cost per lead and so on) |
| Review and export | Approval checklist, PDF and Word download, copy one asset, version label and date, "Not published" status |
| Settings | Workspace name, change password, download my data, delete account, billing (placeholder only) |

Also: light / dark switch (sun / moon button, dark is the default), bigger 20px text,
section sounds and an audio guide, privacy page (GDPR / PIPL principles), phone layout.

## How it is built

```
frontend/   Next.js 16 + Tailwind 4 (Vercel)
backend/    FastAPI + SQLAlchemy + Alembic, Python 3.13 (Render, Docker)
            Postgres and file storage on Supabase (plain Postgres + S3-compatible API)
docs/       Client brief, our 3-week plan, reference screens
```

- The browser only talks to the Next.js app. `/api/*` is forwarded to the backend
  (`BACKEND_URL`, a rewrite in `next.config.ts`), so the login cookie stays on one site.
- Login: email + password, Argon2 hash, an HTTP-only cookie. One owner per workspace.
- AI: every call goes through one adapter, `backend/app/ai/provider.py`
  (Anthropic Claude now; OpenAI and a free `mock` mode also work). Each step (brief summary,
  audiences, directions, assets, budget) runs as a background job in Postgres, is checked
  against a schema, and is saved as structured data with versions. A failed or repeated
  generation never deletes the user's work. `backend/app/ai/safety.py` flags health,
  finance and performance claims and numbers the user never gave.
- Budget maths is done by code, not the AI, so totals are always exact.
- Exports: PDF (fpdf2) and Word (python-docx) are made on the server.
- Security: private projects per user, upload type and size checks (no SVG), rate limits,
  secrets only in environment variables, no campaign text in usage events.

## Run it locally

You need Node 20+, Python 3.13 and Postgres 17.

1. **Database.** Create the role and database once (see `backend/README.md`), or run
   `docker compose up -d db` to get one on port 5434.
2. **Backend.**
   ```bash
   cd backend
   python -m venv .venv
   .venv/Scripts/pip install -r requirements-dev.txt     # macOS/Linux: .venv/bin/pip
   cp .env.example .env                                   # set SECRET_KEY; AI_PROVIDER=mock needs no key
   .venv/Scripts/alembic upgrade head
   .venv/Scripts/uvicorn app.main:app --reload            # http://localhost:8000
   ```
3. **Frontend.**
   ```bash
   cd frontend
   cp .env.example .env.local
   npm install
   npm run dev                                            # http://localhost:3000
   ```

## Checks before a push

```bash
cd backend && .venv/Scripts/python -m pytest       # 286 tests, uses AI_PROVIDER=mock
cd frontend && npx tsc --noEmit && npx eslint src  # types and lint
```

Pushing to `main` deploys both apps automatically (Vercel and Render). Database migrations
run when the backend container starts.

## Settings

All settings are environment variables. Nothing secret is in the code.

- Backend: see `backend/.env.example` (database, storage, AI provider and key, CORS, email).
- Frontend: only `BACKEND_URL` (read at build time).

## Moving to AWS later

Both apps are plain Docker images configured only by environment variables:

- Frontend: `frontend/Dockerfile` (Next.js `standalone` output). Pass `BACKEND_URL` as a build arg.
- Backend: `backend/Dockerfile`. Runs migrations on start, listens on `$PORT`.
- Database: any Postgres (for example RDS). Set `DATABASE_URL`.
- Files: any S3-compatible storage (Supabase now, S3 later). Set the `S3_*` variables.
- Email (for forgot password): any SMTP service, for example AWS SES. Set `SMTP_*`.

No host-specific features are used.
