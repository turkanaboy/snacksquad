# Snack Squad pilot runbook

## Before cutover

- Confirm every legacy application table is empty. The overhaul intentionally stops rather than discarding data.
- Apply the schema and compatible frontend in the same pilot window with `npm.cmd exec -- supabase db push`.
- Run `npm.cmd exec -- supabase migration list` and confirm local and linked histories match.
- Configure the Auth hook, exact redirect URLs, custom SMTP, and anonymous-sign-in setting in [auth-setup.md](auth-setup.md).
- Set `USDA_API_KEY` and deploy `snack-metadata`.
- Add at least one moderator in `public.moderators` after their first login.
- Confirm the `snack-squad-competition-reconciler` Cron job runs every five minutes without errors.
- Keep `public.feature_flags.fantasy_enabled = false` for launch.

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

## Fantasy unlock review

After four full weeks, open the locked Fantasy gate and review all five signals: more than five daily active users, a fully participated bracket, growing weekly users, at least three logs per user per week, and four observed weeks. The UI never unlocks automatically.

If the moderator approves the pilot, run a controlled SQL update:

```sql
update public.feature_flags
set enabled = true,
    updated_by = 'MODERATOR-AUTH-USER-ID'
where key = 'fantasy_enabled';
```

Recheck the desktop and mobile Fantasy navigation, four-to-eight-manager limits, catalog preflight, draft clock, and Friday waiver before announcing the unlock.

## Rollback

- Frontend: redeploy the previous compatible build.
- Fantasy: set `fantasy_enabled` back to false; existing league history remains preserved.
- Schema: do not reverse destructive migrations on a populated pilot. Stop writes, take a database backup, and restore the last known-good project snapshot if a schema rollback is required.
