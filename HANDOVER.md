# BOOOM More: Handover

Everything needed to run, change and move the BOOOM More MVP. No passwords or keys are in
this file: they live only in each service's settings. For how to run the code locally, see
[`README.md`](README.md).

## 1. What is live

| Part | Where | Notes |
| --- | --- | --- |
| Web app | https://boom-ai-six.vercel.app | Vercel (Hobby plan), root folder `frontend` |
| API | https://boom-ai-rrdv.onrender.com | Render free plan, Docker, root folder `backend`, region Singapore, health check `/health` |
| Database and files | Supabase project "Boom Ai" | Region Singapore. Plain Postgres (session pooler, port 5432) and a private bucket `boooom-uploads` used through the S3 API |
| AI | Anthropic (Claude) | Prepaid credits with a spend limit, set by the client in the Anthropic console |
| Keep-awake ping | cron-job.org | Calls `/health` every 10 minutes so the free Render server does not sleep |
| Code | GitHub `rehman240/Boom-Ai`, branch `main` | Currently public (no secrets in it) |

A push to `main` deploys both apps. The backend runs its database migrations when it starts.

## 2. Settings on each service

All settings are environment variables. Change them in the service's dashboard, then redeploy.

**Render (backend)**

| Variable | What it is |
| --- | --- |
| `APP_ENV` | `production` |
| `SECRET_KEY` | Long random string that signs login cookies. Changing it signs everyone out |
| `DATABASE_URL` | Supabase Postgres connection string |
| `CORS_ORIGINS` | The web app address, `https://boom-ai-six.vercel.app` (comma separated if more than one) |
| `STORAGE_BACKEND`, `S3_ENDPOINT_URL`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | File storage (Supabase S3 keys) |
| `AI_PROVIDER` | `anthropic` (also possible: `openai`, or `mock` for free test answers) |
| `AI_MODEL` | Model name, default `claude-opus-5-5` |
| `ANTHROPIC_API_KEY` | The client's Anthropic key |
| `AI_ENABLED` | `false` pauses all AI generation; the app shows a clear message |
| `UPLOAD_MAX_MB`, `RATE_LIMIT_AI`, `AI_JOB_STALE_MINUTES` | Upload size limit (5), AI requests per user (30/hour), when a stuck job counts as failed (5 min) |
| `APP_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | Email for "Forgot password". Not set yet, see section 3 |

**Vercel (frontend)**

| Variable | What it is |
| --- | --- |
| `BACKEND_URL` | `https://boom-ai-rrdv.onrender.com`. Read at build time, so redeploy after a change |

Full list with comments: `backend/.env.example` and `frontend/.env.example`.

## 3. Common tasks

**Turn on "Forgot password".** It is hidden while no email service is set, so users are never
told an email was sent when it wasn't. To turn it on, pick an SMTP service (for example Brevo,
Resend, or AWS SES later), then set on Render: `APP_URL=https://boom-ai-six.vercel.app`, the
`SMTP_*` values and `MAIL_FROM` (an address on a domain the service allows). After the
redeploy the link shows up by itself. No code change needed.

**Change the AI model or provider.** Change `AI_MODEL` (and `AI_PROVIDER` plus its key) on
Render. All AI calls go through `backend/app/ai/provider.py`.

**Pause the AI** (for example when credits run out). Set `AI_ENABLED=false` on Render.
Everything else keeps working.

**Rename the product.** The name is in two places: `frontend/src/lib/brand.ts` and
`backend/app/brand.py` (`BRAND = "BOOOM"`, `PRODUCT = "More"`).

**Change the web address.** Add the domain in Vercel (Settings → Domains), then put the new
address in Render's `CORS_ORIGINS` (and `APP_URL` if email is on). Without the CORS change,
sign in stops working.

**Light / dark theme.** The sun / moon button in the header switches it. Dark is the default
and the choice is saved in the browser. Colours are in `frontend/src/app/globals.css`.

**Check that it is up.** Open https://boom-ai-rrdv.onrender.com/health. It should say the
database is ok.

## 4. Limits of the free plans

- **Render free** sleeps when idle; the first visit then takes about 50 seconds (the app
  shows a "waking up" notice). The cron-job.org ping prevents this. The paid Starter plan
  (about $7/month) removes the need for the ping.
- **Vercel Hobby** is for personal, non-commercial use. Move to Pro (about $20/month per
  member) before a public launch.
- **Supabase free** pauses a project after a week with no activity and has storage limits.
  Normal use and the ping keep it active.
- **Anthropic** usage is paid separately from hosting, from the client's credits.

## 5. Not in this MVP (Phase 2)

- Live connections to ad accounts or analytics, automatic posting, any ad spend
- AI-made finished images (the app writes visual production briefs only)
- Budget forecasts, real billing and payments (billing is a placeholder page)
- Team roles and approvals, native phone apps, a translated interface (the AI can already
  write in other languages)
- Full accessibility audit, advanced monitoring
- Moving to AWS (the app is ready for it, see `README.md`)

## 6. Still open with the client

- Original logo files (with a transparent background) and permission to use them
- How long data is kept, and a contact email for the privacy page
- Who pays for hosting once the free plans are not enough
- Whether the GitHub repo should go back to private (the Render GitHub app must be
  installed on the owner's account first, or auto-deploy stops)
- Which email service to use for "Forgot password"
