# Progress

## Done
- Week 1, task 1: repo setup (git, folder structure, `.gitignore`, `.env.example` files, docs renamed).
- Week 1, task 2: backend base (FastAPI, env config, Postgres + Alembic, /health, CORS, rate limits, Dockerfile, tests).
- Week 1, task 3: database tables (users, projects, briefs, uploads, ai_jobs, events) with first migration. Local DB runs in Docker on port 5434 (5432 and 5433 are used by other Postgres installs on this PC).

## In progress
- Week 1, task 4: login.

## Today's plan (28 Sep 2026)
1. Repo setup ✅
2. Backend base ✅
3. Database tables (users, projects, briefs, uploads, ai_jobs, events) ✅
4. Login (email + password, secure cookie)
5. Frontend base (dark theme, sidebar, breadcrumb, progress bar, login pages)

## Decisions agreed with Ali (28 Sep 2026)
- Brief includes all client-brief fields; currency fixed to USD.
- Product URL is stored only, no scraping.
- Sidebar items are shortcuts into the open campaign.
- Progress bar segments: Brief, Target, Campaign, Creative, Budget, Conversions. Review shows all full.
- Screens without a reference (Identify Target, Conversions, Login, Settings) follow the same style.
- Landing: no animation, placeholder pricing/contact/legal, "Explore an example" opens a read-only demo.
- Budget: AI suggests percentages, code does the maths so totals are exact.
- Supabase for Postgres and file storage, via the S3-compatible API.
- Background jobs: Postgres job table and polling; stale jobs marked failed so the user can retry.
- Word export is a real `.docx`; copy button per asset.
- `AI_ENABLED` env switch pauses AI; `AI_PROVIDER=mock` for building without a key.
- Simple events table, no campaign text in events.
- SVG uploads blocked.

## Open questions
- Client repo link / invite (we work in local git until then, then add remote and push).
- AI provider and API key (who pays).
- Logo files and permission to use them.
- Who pays for hosting if free plans are not enough.
- Data retention and AI provider data handling.
- Supabase, Render, Vercel accounts (Ali to create).
