# Progress

## Done
- Week 1, task 1: repo setup (git, folder structure, `.gitignore`, `.env.example` files, docs renamed).
- Week 1, task 2: backend base (FastAPI, env config, Postgres + Alembic, /health, CORS, rate limits, Dockerfile, tests).
- Week 1, task 3: database tables (users, projects, briefs, uploads, ai_jobs, events) with first migration. Local DB is Ali's installed PostgreSQL 17 on port 5432, database `boooom_more`, role `boooom` (switched from Docker on 29 Sep to save memory; Docker compose still there as a fallback on 5434).
- Week 1, task 4: login API: `POST /auth/signup`, `/auth/login`, `/auth/logout`, `GET /auth/me`. Argon2 password hashes, signed session token in an httpOnly SameSite=Lax cookie (7 days), 10/minute limit on signup and login, same error for wrong password and unknown email.
- Week 1, task 5: frontend base.
  - Dark theme tokens (AA contrast), Inter + Space Grotesk fonts, keyboard focus ring.
  - App shell: sidebar, top bar with breadcrumb, sign out, slide-in menu on phones, skip link.
  - UI parts: Logo, Button, Field (labels, hints, errors), PageHeader, 6-segment ProgressBar.
  - Pages: temporary home, sign up, sign in, overview (empty state), settings (stub).
  - `/api/*` forwarded to the backend, so the login cookie is same-site (Safari blocks cross-site cookies).
  - `src/proxy.ts` sends signed-out users to /login and signed-in users away from /login.
  - `output: "standalone"` and a frontend Dockerfile, so the app can move to AWS.
  - Checked in a real browser at desktop (1440px) and phone (390px) width: sign up, overview, menu, sign out.

- 29 Sep: switched local development from the Docker Postgres to Ali's installed
  PostgreSQL 17 on port 5432 (saves about a gigabyte of memory). Re-verified after the
  switch: 14 backend tests pass, sign up / overview / menu / sign out work in a real
  browser at 1440px and 390px, and `npm run build` produces the `standalone` output the
  frontend Dockerfile copies. The circle in the phone screenshot's bottom-left corner is
  the Next.js dev-mode indicator, not our UI.
- 29 Sep: both Docker images verified once, so the move to AWS later is not a leap of faith.
  Built `backend/Dockerfile` and `frontend/Dockerfile`, ran them together with a throwaway
  Postgres container, and signed a user up through the pair: the backend ran its migrations
  on start and answered `/health` with `db: ok`, and the frontend's `/api` rewrite reached
  the backend container, so the `BACKEND_URL` build arg works. Both containers run as a
  non-root user; images are about 220 MB each. Test containers, network and images removed
  afterwards.
- Week 1, task 6: dashboard.
  - `GET/POST /projects`, `GET/PATCH/DELETE /projects/{id}`, `POST /projects/{id}/duplicate`.
    Creating a campaign also creates its (empty) brief row, so autosave has somewhere to write.
    Duplicating copies the brief but clears the summary confirmation, so the user approves
    the copy's facts. Someone else's campaign returns 404, not 403, so ids cannot be probed.
    The example campaign is read-only and can only be opened or duplicated.
  - Overview screen: continue-working card, three stat cards, recent projects with status and
    last edited, and a row menu for open, rename, duplicate and delete. Loading, empty and
    error states. Create and rename use a dialog; delete asks first.
  - "Assets drafted" is a real count, which is 0 until creative assets exist in week 2. It is
    deliberately not a made-up number.
  - `/projects/[id]/[stage]` is a shell with the breadcrumb, title and progress bar. Each
    stage's screen replaces the placeholder in its own task.

## Next (Week 1)
7. Settings: account, privacy, export data, delete project/account, billing placeholder.
8. Campaign Brief form with autosave.
9. File upload (logo, reference files).
10. AI adapter + brief summary job.
11. Deploy (needs Supabase, Render, Vercel accounts from Ali).
12. Test and wrap up.

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
- The app moves to AWS later: Docker images for both apps, env vars only, no host-only features.
- Design should be modern. Reference screens are the base, not a pixel copy.

## Notes for deploy
- Rate limits use the client IP from `X-Forwarded-For`. Once deployed, check that the real
  visitor IP reaches the backend through Vercel's `/api` forwarding. If it doesn't, all users
  would share one limit.
- `BACKEND_URL` is read when the frontend is built (rewrites are baked in).

## Open questions
- Client repo link / invite (we work in local git until then, then add remote and push).
- AI provider and API key (who pays).
- Logo files and permission to use them.
- Who pays for hosting if free plans are not enough.
- Data retention and AI provider data handling.
- Supabase, Render, Vercel accounts (Ali to create).
