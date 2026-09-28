# Progress

## Done
- Week 1, task 1: repo setup (git, folder structure, `.gitignore`, `.env.example` files, docs renamed).
- Week 1, task 2: backend base (FastAPI, env config, Postgres + Alembic, /health, CORS, rate limits, Dockerfile, tests).
- Week 1, task 3: database tables (users, projects, briefs, uploads, ai_jobs, events) with first migration. Local DB runs in Docker on port 5434 (5432 and 5433 are used by other Postgres installs on this PC).
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

## Next (Week 1)
6. Dashboard: create, continue, duplicate, delete project; status and last edited.
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
