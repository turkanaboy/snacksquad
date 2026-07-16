# Snack Squad

Private Carnegie Higher Ed snack logging and social competition. Members sign in by company magic link, record daily snacks, upvote coworker entries, follow rolling standings, and play the automated weekly bracket. Fantasy leagues are open with five-round drafts, fixed rosters, and two Monday-Friday scoring weeks.

## App setup

1. Install Node.js dependencies with `npm.cmd install`.
2. Copy `.env.example` to `.env.local` and add the URL and publishable key for either your hosted Supabase project or a local stack.
3. Copy `supabase/functions/.env.example` to `supabase/functions/.env` and add the server-only USDA, Resend, sender, and site URL values. Never expose a secret/service-role key to the browser app.
4. Start the app with `npm.cmd run dev`.

### Optional local Supabase

Install Docker Desktop, then start and reset the disposable local stack:

```powershell
npm.cmd exec -- supabase start
npm.cmd exec -- supabase db reset --local --yes
```

Open Mailpit at `http://127.0.0.1:54324` to follow local magic links.

### Demo data

After applying the migrations to an empty Supabase project, paste `supabase/seed.sql` into the Supabase SQL Editor and run it. A local database reset runs the same file automatically. It creates eight coworkers, 16 snacks, four weeks of logs and reports, a live bracket, badges, upvotes, and correction history. Request a magic link for `alex.morgan@carnegiehighered.com` (moderator) or another seeded address listed in the file.

The seed inserts fake Auth users and application history. Only run it in a demo or development project whose existing data you do not need to preserve.

## Verification

Browser E2E and hosted-smoke setup live in [`docs/testing.md`](docs/testing.md).

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd exec -- supabase db lint --local --schema public --level warning --fail-on warning
npm.cmd exec -- supabase db reset --local --yes --no-seed
npm.cmd exec -- supabase test db --local supabase/tests/database
npm.cmd exec -- supabase db reset --local --yes
```

## Hosted services

Link the pilot project, apply migrations, configure USDA FoodData Central, and deploy the authenticated metadata function:

```powershell
npm.cmd exec -- supabase link --project-ref YOUR_PROJECT_REF
npm.cmd exec -- supabase db push
npm.cmd exec -- supabase secrets set USDA_API_KEY=your-data-gov-key
npm.cmd exec -- supabase functions deploy snack-metadata
npm.cmd exec -- supabase functions deploy fantasy-notifications --no-verify-jwt
```

Complete the exact Auth, SMTP, moderator, Cron, and rollout checks in [docs/auth-setup.md](docs/auth-setup.md) and [docs/pilot-runbook.md](docs/pilot-runbook.md).

## Product guardrails

- No calorie, serving, quantity, rating, or comment tracking.
- Personal log history stays private; shared surfaces use narrow database projections.
- Canonical metadata changes require a moderator; members submit corrections.
- Bot-test activity scores only in its linked Fantasy season and is excluded from shared rankings, feeds, brackets, badges, and reports.
