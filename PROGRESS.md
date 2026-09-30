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
- Week 1, task 7: settings.
  - Workspace rename, email change and password change, plus a JSON export of everything in
    the account and account deletion. Changing the email or password, or deleting the
    account, needs the current password; those routes use the login rate limit.
  - Changing the password signs out other devices. `users.session_version` is bumped and the
    token carries the version it was issued with, so older tokens stop working. A counter,
    not a timestamp: JWT stores `iat` in whole seconds, so a timestamp cutoff would either
    refuse the new token or keep a token issued in the same second.
  - Cookie handling moved to `app/session.py`, shared by the auth and account routes.
  - The export never contains the password hash or internal owner ids.
  - Settings screen: workspace, email, password, data export, a privacy summary of what is
    stored today, a billing placeholder, and a delete-account confirmation.
  - Project list now breaks ties on id, so campaigns edited at the same moment keep a stable
    order between refreshes.
- Week 1, task 8: campaign brief with autosave.
  - `GET/PATCH /projects/{id}/brief`. A PATCH carries only the fields that changed, so a
    save can never blank out something the user typed elsewhere. Emptied text is stored as
    NULL, so "missing" means one thing everywhere. Saving also moves the campaign from
    draft to in progress and refreshes its last-edited time on the dashboard.
  - `REQUIRED_FIELDS` lives on the server and drives both the checklist in the form and the
    check the generate step will use, so the two can't drift apart.
  - All the fields from section 4.3 of the client brief. Language and currency are fixed
    (English, USD) for this release, so they are shown as text rather than asked for.
  - `useAutosave` saves about a second after typing stops. A failed save keeps its fields
    queued and shows a Retry, and pending changes are also flushed when the tab is hidden or
    the page is left.
  - Bad URLs and an end date before the start date are caught in the form. When a field is
    fixed it is saved along with the next change, so nothing stays behind.
  - The example campaign's brief is readable but not editable.
- Week 1, task 9: file uploads.
  - `app/storage.py` holds one interface with two backends: the local disk for development
    and any S3-compatible bucket for deployment. Nothing else knows which is in use, and
    it is injected, so tests write to a temporary folder.
  - The type is read from the file's own first bytes, not the browser's content type,
    which the uploader controls. SVG is refused outright: it can carry script, and serving
    one from our origin would let it act as this app.
  - PNG, JPEG, WebP and PDF, 5 MB each, 10 files per campaign, one logo that replaces the
    previous one. Storage keys are generated here, never built from the uploaded filename.
  - Files stay private: they are streamed to their owner by the API with `nosniff`, images
    inline and PDFs as downloads. A file id from another campaign is not served.
  - Brand assets panel on the brief screen: logo slot, reference list with previews,
    drag and drop, remove, and the size and type rules stated up front.

- Week 1, task 10: AI adapter and brief summary (30 Sep).
  - `app/ai/provider.py` is the only place that calls a model. Anthropic (official SDK,
    structured JSON output, server-side refusal fallback, low effort), OpenAI (Responses
    API, strict JSON schema, `store=false`) and an offline mock that answers from the
    brief itself. `AI_PROVIDER` chooses; a missing key fails with a plain message.
  - Errors reaching the user never contain prompts, brief text or keys, and say whether
    a retry can help.
  - Background jobs in `ai_jobs` (`app/jobs.py`): one automatic retry for a transient
    error or a malformed answer, a job stuck for 5 minutes is marked failed, a second
    click rejoins the running job, and results are written only on success, so a failed
    run never erases the previous summary. 30 generations per user per hour.
  - Summary (`app/ai/brief_summary.py`, prompt `brief_summary.v1`): overview, offer,
    conversion goal, audience limits, facts each "based on" a brief field, assumptions,
    questions for missing facts, and claims that need human review. Stored with
    provider, model, prompt version and time.
  - `app/ai/safety.py` runs on every answer from any provider: flags health, finance and
    performance claims in the brief, and any figure in the summary the user never gave.
  - The summary knows which brief it was made from. Editing the brief afterwards marks it
    "Outdated", and only a current summary can be confirmed. Confirming moves the
    campaign on to Identify Target.
  - Brief screen: "Review brief" saves pending edits and starts the job; progress,
    failure with "Try again", ready, confirmed and outdated states; the summary panel
    below the form with Regenerate and Confirm facts. The job survives a page refresh.
  - Tests: 86 backend tests, including the real provider adapters against a fake HTTP
    server. Checked in a real browser at 1440px and 390px, including the failure state.
  - Not yet tried against a real Anthropic or OpenAI key (none yet). Needs one quick run
    once the key arrives.

- 30 Sep: pushed all work to the client repo, https://github.com/rehman240/Boom-Ai (private), branch `main`.

## Next (Week 1)
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
- AI provider and API key (who pays).
- Logo files and permission to use them.
- Who pays for hosting if free plans are not enough.
- Data retention and AI provider data handling.
- Supabase, Render, Vercel accounts (Ali to create).
