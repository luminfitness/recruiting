# Deploying the USAPT demo to Vercel + Vercel Postgres

This app is built for Vercel + Neon-backed Postgres. The local embedded Postgres
(`pnpm db:dev:start`) is dev-only. Production reads two connection strings:

- `DATABASE_URL` — a role **without** RLS bypass (RLS policies apply). Tenant +
  market scoping depends on this. Must be the pooled/transaction-mode endpoint.
- `SERVICE_DATABASE_URL` — the **table-owner** role. Postgres tables use
  `ENABLE` (not `FORCE`) row-level security, so the owner bypasses RLS — that is
  exactly the "service" role the app needs for cross-org/login/cron paths. No
  `BYPASSRLS` attribute is required (Neon doesn't grant it anyway).

> ⚠️ **DEMO_MODE=1 makes the site wide open.** It enables `/debug`, which lets
> anyone with the URL become any user (including admin) with no login. Fine for
> a throwaway test link; never for real production data.

## 1. Push to GitHub
Create an empty repo (no README/license) under your account, then:
```
git remote add origin https://github.com/<you>/usapt-recruiting-platform.git
git push -u origin main
```

## 2. Import into Vercel (dashboard)
New Project → import the repo. Settings:
- **Root Directory:** `apps/web`  (Vercel installs the pnpm workspace from the repo root automatically)
- **Framework Preset:** Next.js  (auto-detected)
- Install/Build/Output: leave defaults (`pnpm install` / `next build` / `.next`)

Don't deploy yet — add storage + env first (or let the first build fail, then redeploy).

## 3. Add Vercel Postgres
Project → Storage → Create → Postgres. This provisions a Neon DB and injects a
`DATABASE_URL`/`POSTGRES_URL` (the **owner** role). That owner string becomes our
`SERVICE_DATABASE_URL`.

Then create the non-owner app role (run once, via Vercel Postgres "Query" tab or
`psql "<owner-string>"`). Password: generate with `openssl rand -hex 24`.
```sql
CREATE ROLE usapt_app WITH LOGIN PASSWORD '<app-password>';
GRANT USAGE ON SCHEMA public TO usapt_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO usapt_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO usapt_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO usapt_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO usapt_app;
```
`DATABASE_URL` = the owner string with the user/password swapped to
`usapt_app:<app-password>`, keeping the **-pooler** host + `?sslmode=require`.

## 4. Run migrations + seed (once, from a machine with the strings)
```
export PATH="$HOME/.local/node/bin:$PATH"
cd packages/db
SERVICE_DATABASE_URL='<owner pooled string>' DATABASE_URL='<usapt_app pooled string>' pnpm migrate
SERVICE_DATABASE_URL='<owner pooled string>' DATABASE_URL='<usapt_app pooled string>' pnpm seed
```
`migrate` applies schema + `rls-policies.sql`; `seed` creates the demo org and the
Marc/Maddy/Tanya/Diego personas + sample funnel data.

## 5. Set env vars (Vercel → Settings → Environment Variables, Production)
Secret values are in the gitignored `.env.production.local`. Set:
`DATABASE_URL`, `SERVICE_DATABASE_URL`, `AUTH_SECRET`, `CRON_SECRET`,
`INBOUND_WEBHOOK_SECRET`, `INTEGRATION_CREDENTIALS_KEY`, `ZOOM_WEBHOOK_SECRET`,
`DEMO_MODE=1`, and `APP_BASE_URL=https://<your-vercel-domain>`.

## 6. Deploy + verify
Redeploy. Visit `/debug`, "Become" each persona, confirm the role-scoped shells
render (operator console vs field apps) and the funnel screens load.

## Notes
- Cron (`/api/cron/tick`) needs an external scheduler (GitHub Actions or Vercel
  Cron) presenting `CRON_SECRET` — optional for a click-through demo.
- Inbound-email + Zoom webhooks are inert until a provider is configured.
