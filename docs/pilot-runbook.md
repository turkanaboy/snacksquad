# Snack Squad pilot runbook

## Before cutover

- Confirm every legacy application table is empty. The overhaul intentionally stops rather than discarding data.
- Apply the schema and compatible frontend in the same pilot window with `npm.cmd exec -- supabase db push`.
- Run `npm.cmd exec -- supabase migration list` and confirm local and linked histories match.
- Configure the Auth hook, exact redirect URLs, custom SMTP, and anonymous-sign-in setting in [auth-setup.md](auth-setup.md).
- Set `USDA_API_KEY` and deploy `snack-metadata`.
- Set `RESEND_API_KEY`, `FANTASY_EMAIL_FROM`, and `SITE_URL`, then deploy `fantasy-notifications --no-verify-jwt`.
- Add Vault secrets named `snack_squad_project_url` and `snack_squad_service_role_key`; confirm the `fantasy-notification-sender` Cron job runs each minute.
- Configure the frontend host to send Content-Security-Policy, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, and Permissions-Policy headers; the exact CSP must allow the selected Supabase project and approved USDA image hosts.
- Add at least one moderator in `public.moderators` after their first login.
- Confirm the `snack-squad-competition-reconciler` Cron job runs every five minutes without errors.
- Confirm `public.feature_flags.fantasy_enabled = true`; the site is intentionally unused while the bot test runs.

## Pilot smoke test

Use two eligible company accounts and one ineligible external address.

1. Confirm the external address is rejected before an Auth user is created.
2. Sign in both company accounts by magic link and refresh each session.
3. Search a known product, log it, and verify only its owner sees the private log row.
4. Log the same canonical snack from the second account and verify two board entries appear.
5. Upvote the coworker's entry; confirm self-upvote remains unavailable and the Top 10 refreshes.
6. Submit and review a catalog correction as member and moderator.
7. Nominate the same bracket snack from both accounts and confirm one entry with two owners.
8. Cast and replace one matchup vote. Confirm resolved matchups no longer accept votes.
9. After Friday reconciliation, verify the weekly report and badge tenures appear.
10. Check desktop, tablet, and mobile navigation plus keyboard focus and reduced-motion behavior.

## Operations

- Bracket automation: Monday Round of 16, Tuesday quarterfinals, Wednesday semifinals, Thursday final; rounds close at 5:00 PM Eastern and tied matches use the bounded sudden-death rule.
- Friday reports publish at 9:00 AM Eastern and snapshot standings, category winners, bracket champion, and badge changes.
- Monitor Cron history, Auth hook failures, Edge Function errors, and Supabase security/performance advisors during the pilot.
- Catalog or USDA FoodData Central outages must not block manual entries.

## Fantasy bot mechanics test

Run the live mechanics test only after hosted preflight confirms matching migration history, no Fantasy rows, no human activity, configured secrets, and a healthy reconciler:

```powershell
npm.cmd run fantasy:bot -- run --live
npm.cmd run fantasy:bot -- inspect RUN_ID
```

The run creates four synthetic Auth users, a four-manager league, one manual pick, one preference auto-pick, fallback auto-picks, captured start/reminder mail, tied scoring, and a completed retained season. Verify it remains absent from Home, general rankings, brackets, non-Fantasy badges, and weekly reports.

Do not clean up after verification. Immediately before coworkers are invited, and only after the owner explicitly asks, first inspect the exact run and then execute the guarded command:

```powershell
npm.cmd run fantasy:bot -- cleanup RUN_ID
npm.cmd run fantasy:bot -- cleanup RUN_ID --execute --confirm RUN_ID
```

## Rollback

- Frontend: redeploy the previous compatible build.
- Fantasy: set `fantasy_enabled` back to false; existing league history remains preserved.
- Schema: do not reverse destructive migrations on a populated pilot. Stop writes, take a database backup, and restore the last known-good project snapshot if a schema rollback is required.
