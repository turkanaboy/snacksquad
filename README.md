# Snack Squad

Private Carnegie Higher Ed snack logging and social competition. Members sign in by company magic link, record daily snacks, upvote coworker entries, follow rolling standings, and play the automated weekly bracket. Badges and Friday reports preserve winners. Monthly fantasy leagues are implemented but remain locked until the pilot gate is deliberately approved.

## Local setup

1. Install Node.js, Docker Desktop, and the Supabase CLI dependencies with `npm.cmd install`.
2. Copy `.env.example` to `.env.local` and add `VITE_SUPABASE_URL` plus `VITE_SUPABASE_PUBLISHABLE_KEY`. Never add a secret or service-role key to the browser app.
3. Start and reset the disposable local stack:

```powershell
npm.cmd exec -- supabase start
npm.cmd exec -- supabase db reset --local --yes
npm.cmd run dev
```

4. Open Mailpit at `http://127.0.0.1:54324` to follow local magic links.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd exec -- supabase db lint --local --schema public --level warning --fail-on warning
npm.cmd exec -- supabase test db --local supabase/tests/database
```

## Hosted services

Link the pilot project, apply migrations, configure the Open Food Facts contact, and deploy the authenticated metadata function:

```powershell
npm.cmd exec -- supabase link --project-ref YOUR_PROJECT_REF
npm.cmd exec -- supabase db push
npm.cmd exec -- supabase secrets set OPEN_FOOD_FACTS_CONTACT=you@example.com
npm.cmd exec -- supabase functions deploy snack-metadata
```

Complete the exact Auth, SMTP, moderator, Cron, and rollout checks in [docs/auth-setup.md](docs/auth-setup.md) and [docs/pilot-runbook.md](docs/pilot-runbook.md).

## Product guardrails

- No calorie, serving, quantity, rating, or comment tracking.
- Personal log history stays private; shared surfaces use narrow database projections.
- Canonical metadata changes require a moderator; members submit corrections.
- Fantasy stays disabled until a moderator reviews four weeks of pilot signals and explicitly changes `fantasy_enabled`.
