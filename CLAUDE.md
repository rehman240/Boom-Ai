# BOOOM More MVP: Project Context for Claude Code

Read this file first, then the two documents in `docs/`.

## 1. What this project is

We are building an MVP of **BOOOM More**, an AI campaign workspace, for a client. A user enters a business idea and is guided to a ready campaign package: audience, campaign direction, ad copy and assets, budget, conversion tracking, and export.

- Two developers (Ali and a friend) are building it in **3 weeks** with a very tight budget. Keep everything lean and simple.
- This is an **MVP**: every part of the client's brief is built and works end to end, but each part is kept basic. No extras, no over-engineering.
- Real users will use it, so it must work and be deployed. It is not a throwaway demo.

## 2. Source documents (in `docs/`)

1. `docs/BOOOM_More_Product_and_Design_Brief.docx`: the client's brief. This is the **source of truth for what to build** (screens, fields, behaviour, AI rules).
2. `docs/BOOOM_More_MVP_Plan_3_Weeks_v2.docx`: our own week-by-week plan. This is the source of truth for **how deep to build and in what order**.
3. `docs/reference-screens/`: client demo screenshots (landing, overview, brief, campaign directions, creative workspace, budget, review and export). Use them as the **UI reference**. Sample data in them is a fictional "NOVA Desk Lamp" campaign.

If the client brief and our plan differ, follow the client brief for behaviour and our plan for depth and scope limits. If still unclear, ask Ali before guessing.

## 3. Decisions already made (do not reopen)

- **Hosting:** Vercel (Next.js frontend), Render (FastAPI backend), Supabase or Neon (Postgres and file storage). The client confirmed this. Not AWS for now.
- **AI provider:** direct Anthropic or OpenAI API, behind an adapter so the provider can be changed. Not Bedrock. Model name and API key come from environment variables.
- **Stack:** Next.js + Tailwind, FastAPI, Postgres.
- **Auth:** simple email and password, one owner per workspace. No team roles.
- **Market and language:** English and US only.
- **Design:** dark theme, follows the reference screens. No special animation.
- **Phone support:** it is a responsive web app. Layout must work in a phone browser. No native app.

## 4. The user flow to build

Sidebar: Overview, Campaigns, Audiences, Creative, Budgets, Results. A 6-segment progress bar shows the stage.

1. **Landing page** (public): four capabilities (Generate Campaign, Identify Target, Manage Conversions, Allocate Budget), sample output, call to action.
2. **Dashboard / Overview:** create project, continue draft, duplicate, delete, status, last edited.
3. **Campaign Brief:** business name, product or service, what makes it different, goal, target location, budget, dates, brand voice, logo and reference file upload, autosave. AI summary so the user confirms extracted facts before generating.
4. **Identify Target:** 2 to 4 audience cards (need, motivation, objection, message angle, channels, "based on" labels). Edit, pick one, add exclusions, or write their own.
5. **Generate Campaign:** 3 distinct directions. Compare, choose, edit, regenerate one at a time, with short history.
6. **Creative Workspace:** tabs for overview, landing page outline, short ad copy, long ad copy, email, social post, visual production brief. Edit fields, regenerate a single field only, save version, restore version, copy, approve.
7. **Allocate Budget:** recommended channel split with amounts and percentages, lock a channel and rebalance the rest, total always equals the budget, assumptions shown, media cost and production cost kept separate. No forecasts.
8. **Manage Conversions:** goal, landing destination, tracking checklist, review schedule, manual entry of spend, leads, sales, revenue, simple calculations (like cost per lead), clear message when data is missing.
9. **Review and Export:** approval checklist, PDF export, editable Word or text export, copy single assets, version label and date, clear "Not published" status.

## 5. Week plan

- **Week 1:** project setup, hosting setup, database, login, dashboard, settings, campaign brief (autosave, upload, AI summary).
- **Week 2:** AI engine (staged steps, background jobs, retry), Identify Target, Generate Campaign, Creative Workspace with versions and single-field regeneration, basic AI safety.
- **Week 3:** Allocate Budget (days 1 to 2), Manage Conversions (day 3), Review and Export (day 4), landing page (day 5), testing on laptop and phone browser (day 6), go live and handover with README (day 7).

Work one week at a time. At the start of each week, propose a short task list and wait for Ali's OK. At the end of each week, confirm what now works.

## 6. Out of scope (Phase 2). Do not build these

- Live ad account or analytics connections, auto posting, any ad spend
- AI-generated finished images (visual production briefs only)
- Budget forecasts, real billing or payments (billing is a placeholder page only)
- Team roles and approvals, native mobile apps, other languages
- Full accessibility audit, advanced monitoring
- Moving hosting to AWS or elsewhere (later paid task)

If a request goes beyond this MVP, say so and ask Ali before adding it.

## 7. Engineering rules

**Keep the app easy to move to another host later:**
- Add a Dockerfile for the backend.
- All keys and settings in environment variables. Never hardcode secrets. Commit a `.env.example`.
- Use plain Postgres and plain file storage. Avoid provider-specific features (for example Supabase-only auth or realtime).
- All AI calls go through one adapter module.

**AI pipeline:**
- Staged steps: brief summary, audience, campaign directions, assets. Each step saved as **structured data** (JSON validated against a schema).
- Generation runs as a background job. A page refresh must not lose it. Failed steps can be retried.
- **Never erase existing user work** when a generation fails or is regenerated. Keep versions.
- Regenerating one field must not touch the other fields.

**AI content rules (from the client brief):**
- AI must not invent prices, results, statistics, or testimonials. Use only facts the user gave.
- Flag risky claims (health, finance, performance) for human review.
- The AI suggests, the human decides. No autonomous spending or publishing.
- Show assumptions and "based on" reasons.

**Basic security:** HTTPS, private projects per user, secrets on the server only, upload type and size checks, basic rate limits, never put private campaign text in analytics events.

**Basic quality:** keyboard use, form labels, and contrast on main flows. Responsive layout. Clear loading, empty, and error states.

## 8. How to work with Ali

- Ali writes in Roman Urdu and English mix. Reply in simple English or simple Roman Urdu. Keep explanations short and clear.
- Plan first, then build. Show a short plan before big changes.
- Small, working steps. Commit often with clear messages.
- Ask when something is unclear instead of guessing. One question at a time.
- Keep a `PROGRESS.md` with what is done, what is in progress, and open questions, updated at the end of each session.

## 9. Open items (waiting on client)

- Who provides the AI API key or credits (AI usage cost is separate from development budget)
- Logo files and permission to use them
- Who pays for hosting if free plans are not enough for real users
- Confirmation on data retention and AI provider data handling before launch