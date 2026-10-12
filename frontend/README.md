# BOOOM More frontend

Next.js 16 (App Router) + Tailwind 4. Deployed on Vercel; `Dockerfile` builds a `standalone`
image for other hosts.

```bash
cp .env.example .env.local   # BACKEND_URL=http://localhost:8000
npm install
npm run dev                  # http://localhost:3000
npx tsc --noEmit && npx eslint src
```

- The browser calls `/api/*` on this app; `next.config.ts` forwards it to `BACKEND_URL`
  (read at build time). Route protection is in `src/proxy.ts` (Next 16's middleware).
- Pages: `src/app` (`(auth)` sign in / sign up, `(app)` the signed-in workspace, `privacy`).
  Shared UI: `src/components/ui`, workspace parts: `src/components/app`, API helpers: `src/lib`.
- Colours are tokens in `src/app/globals.css`: dark on `:root`, light on
  `:root[data-theme="light"]`. Use the token classes (`bg-surface`, `text-muted`, `text-cyan`,
  ...) rather than fixed colours so both themes keep working.
- Product name: `src/lib/brand.ts`.
- This Next.js version differs from older ones: read `node_modules/next/dist/docs/` before
  using a Next API (see `AGENTS.md`).
