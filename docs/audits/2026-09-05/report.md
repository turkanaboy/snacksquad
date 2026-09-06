# Snack Squad project audit

Reviewed September 5, 2026 (America/New_York), at commit `255016a912fdf8518995607f73f62b37b9a32978`.

The main risks are competition integrity and incomplete state handling. This audit found **14 actionable items: 4 high priority, 8 medium priority, and 2 cleanup items**. No critical anonymous data exposure was found in the inspected database permissions. Findings cover the current project, including pre-existing issues, rather than a branch diff.

## Actionable Findings

P1 means high priority; P2 means a meaningful defect; P3 means cleanup. “Browser” refers to the real application running locally with synthetic API responses, not production mutation testing.

| ID | Priority | Area | Finding | Evidence |
|---|---|---|---|---|
| 1 | P1 | Security / integrity | Members can choose scoring timestamps | Production grants, policies, constraints and triggers inspected |
| 2 | P1 | Reliability | A Fantasy feature-state failure blocks the whole app | Reproduced in browser |
| 3 | P1 | Functional gap | Draft/lobby state does not refresh for other managers' actions | Source trace and browser visibility-event check |
| 4 | P1 | Correctness | Switching leagues leaves the old season's controls active | Reproduced with delayed response |
| 5 | P2 | Mobile UX | No reachable sign-out on mobile | Reproduced at 390px |
| 6 | P2 | Functional gap | Existing members cannot create or join another league | Reproduced in browser |
| 7 | P2 | Data / UX | Saved auto-pick queues cannot be reliably viewed, edited or cleared | Client and RPC trace |
| 8 | P2 | Data integrity | Merging a liked snack can break private-profile loading | SQL and nullable relationship trace |
| 9 | P2 | Correctness | A successful vote can be shown as rolled back | Mutation/error-path trace |
| 10 | P2 | Pagination | Activity pagination skips timestamp ties | SQL cursor and client trace |
| 11 | P2 | Product gap | Users cannot see their own badges | Reproduced in browser |
| 12 | P2 | Data provenance | Historical ratings were fabricated by a deployed migration | Migration source and production migration history |
| 13 | P3 | Dead code | Two unused runtime helpers and obsolete CSS remain | Reference search and compiler checks |
| 14 | P3 | Documentation | README and backlog disagree with shipped behavior | Documentation compared with source |

### 1. Make event timestamps server-owned

The authenticated role has INSERT and UPDATE access to `snack_logs.logged_at`, and INSERT access to `log_upvotes.created_at`. The insert policies check ownership only. The log mutation trigger runs on UPDATE/DELETE, so it does not prevent a new log from being dated in the past or future. Production metadata confirms these permissions and the absence of an insert timestamp guard.

Fantasy scoring trusts those timestamps. A member can backdate their own activity to award points to another manager during a scoring window, or insert future activity. Archived Fantasy standings are calculated from current events, so backdated activity can also change historical results. This is a signed-in integrity vulnerability, not an anonymous-access issue. No exploit inserts were performed against production.

Evidence: [table grants and policies](C:/Users/tyler/Claude/SnackSquad/supabase/migrations/20260710213254_snack_squad_overhaul.sql:358), [event timestamps used in scoring](C:/Users/tyler/Claude/SnackSquad/supabase/migrations/20260712190200_fantasy_bot_runs.sql:219), [archive recalculation](C:/Users/tyler/Claude/SnackSquad/supabase/migrations/20260730120000_competition_archives.sql:21).

Fix: restrict member INSERT/UPDATE privileges to editable columns, or use trusted server-side write functions/triggers that assign time. Preserve explicit service-only historical fixture paths. Test backdated and future log/upvote attempts as `authenticated`, including archive stability. Supabase distinguishes table/column privileges from row policies; both matter here. [Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).

### 2. Decouple optional Fantasy loading from account bootstrap

`loadMyProfile`, `refreshCore` and `getFantasyFeatureState` share one `Promise.all`; `setProfile` happens only after all three succeed. A 503 from the Fantasy feature RPC leaves a successfully authenticated user on “Loading your taste file…” even when their profile and core feed loaded successfully. The browser reproduction confirmed zero recovery buttons.

Evidence: [App bootstrap](C:/Users/tyler/Claude/SnackSquad/src/App.tsx:112), [screenshot](C:/Users/tyler/Claude/SnackSquad/docs/audits/2026-09-05/feature-failure.png).

Fix: load the profile independently, degrade Fantasy separately, and provide retry/sign-out when profile loading itself fails. Add a browser test where only the feature-state RPC fails.

### 3. Refresh shared competition state

Fantasy loads on mount, league selection and the current user's actions. It has no polling, subscription, visibility refresh or manual refresh in the normal lobby/draft screen. A creator can remain at three managers after a fourth joins; the next manager can remain unable to draft after the previous manager picks. Brackets similarly load on mount and local actions. The Home activity board also lacks a deliberate refresh on returning Home; the release-news widget already has a useful visibility/interval lifecycle.

Evidence: [Fantasy loading](C:/Users/tyler/Claude/SnackSquad/src/screens/FantasyScreen.tsx:39), [Bracket loading](C:/Users/tyler/Claude/SnackSquad/src/screens/ContestsScreen.tsx:47). The isolated Fantasy visibility event caused zero overview requests. Existing competition E2E tests explicitly reload after managers join.

Fix: add bounded polling during a draft, refresh on visibility/focus, and expose a retry/refresh action. Avoid overlapping loads and preserve in-progress input. Verify with two browser contexts and an expired pick deadline.

### 4. Prevent stale league responses and actions

Changing `selectedId` immediately updates the league selector while `overview` still contains the previous league's season. The current season determines `myTurn` and the season ID submitted by `choose`. During a slow response, the UI can therefore display league B while leaving league A's draft controls usable. Requests also have no generation check, so a late response can overwrite a newer selection.

Evidence: [load and overview assignment](C:/Users/tyler/Claude/SnackSquad/src/screens/FantasyScreen.tsx:39), [pick submission](C:/Users/tyler/Claude/SnackSquad/src/screens/FantasyScreen.tsx:139), [selector](C:/Users/tyler/Claude/SnackSquad/src/screens/FantasyScreen.tsx:171). The delayed-response browser check reproduced the old pick history and active “You're on the clock” state under the new selection. It did not submit a pick.

Fix: associate loaded data with its league ID, disable season actions during a mismatch, and discard stale responses. Reset league-specific draft state when switching. Test delayed and out-of-order responses.

### 5. Restore mobile sign-out

The only sign-out button is inside the desktop side rail. At widths below 760px that rail is hidden, and neither mobile navigation nor Profile offers sign-out. Desktop visibility was true and mobile visibility false in Chromium.

Evidence: [sign-out control](C:/Users/tyler/Claude/SnackSquad/src/components/AppShell.tsx:49), [mobile CSS](C:/Users/tyler/Claude/SnackSquad/src/styles.css:442), [mobile profile screenshot](C:/Users/tyler/Claude/SnackSquad/docs/audits/2026-09-05/mobile-profile.png).

Fix: put an account/sign-out action on Profile or a mobile account menu. Catch and display sign-out failures; the current App callback discards the rejecting promise.

### 6. Keep create/join available after the first league

Create and join forms render only when `!leagues.length`. After joining one league, the user sees a switcher but no way to enter another code or create another league, although the API and switcher support multiple leagues.

Evidence: [conditional forms](C:/Users/tyler/Claude/SnackSquad/src/screens/FantasyScreen.tsx:163), [existing-member screenshot](C:/Users/tyler/Claude/SnackSquad/docs/audits/2026-09-05/fantasy-existing-member.png). Both controls had a count of zero in the browser fixture.

Fix: add compact “Create league” and “Join league” actions beside the switcher. Test a user who already belongs to a league.

### 7. Complete the auto-pick queue lifecycle

`preferences` starts empty on every mount. The overview RPC does not return the saved queue, so returning to the draft hides previously saved choices. Saving a newly built queue replaces the old queue in SQL. Removing the final item hides the Save button, making it impossible to persist an empty queue. The local array also survives league changes within the same screen.

Evidence: [queue state](C:/Users/tyler/Claude/SnackSquad/src/screens/FantasyScreen.tsx:37), [conditional Save button](C:/Users/tyler/Claude/SnackSquad/src/screens/FantasyScreen.tsx:196), [replace-all RPC](C:/Users/tyler/Claude/SnackSquad/supabase/migrations/20260715000632_fantasy_fixed_roster_slots.sql:63).

Fix: return only the viewer's saved preferences, initialize them per season, keep Save/Clear available for an empty queue, and show saved/unsaved state. Test reload, clear-all and league switching.

### 8. Migrate snack preferences when merging snacks

`merge_snacks` moves logs, favorites and corrections, then hides the duplicate through `merged_into_id`. It predates `snack_preferences` and never moves those rows. The preferences SELECT embeds `snacks(...)`; RLS hides a merged snack, producing a null embedded relationship. `mapSnackPreference` dereferences that relationship, and the shared private-profile `Promise.all` then rejects.

Evidence: [merge updates](C:/Users/tyler/Claude/SnackSquad/supabase/migrations/20260712190000_fantasy_two_week_bot_pilot.sql:245), [mapper](C:/Users/tyler/Claude/SnackSquad/src/snackStore.ts:112), [profile loading](C:/Users/tyler/Claude/SnackSquad/src/screens/ProfileScreen.tsx:53).

Fix: merge preferences transactionally, with an explicit rule for conflicting sentiments, and tolerate unavailable related snacks in the client. Verify against an isolated database; this path was traced, not exercised through a production merge.

### 9. Separate vote persistence from leaderboard refresh

The optimistic vote mutation and subsequent leaderboard query share one `try/catch`. If the vote succeeds but the leaderboard query fails, the catch restores the original board entry even though the database vote persisted. Rapid repeated clicks can also overlap because the vote control has no in-flight guard.

Evidence: [toggleUpvote](C:/Users/tyler/Claude/SnackSquad/src/App.tsx:153).

Fix: treat a successful mutation as committed; handle ranking refresh failures separately. Serialize votes per entry or coalesce to the user's latest intent. Test a successful insert followed by a failed leaderboard request and an out-of-order double toggle.

### 10. Use a composite activity cursor

The feed orders by `(logged_at DESC, id DESC)`, but the next-page filter and client cursor contain only `logged_at`. If a page ends in a group of equal timestamps, remaining rows in that group are excluded permanently. Batch inserts and imports commonly share transaction timestamps.

Evidence: [SQL cursor](C:/Users/tyler/Claude/SnackSquad/supabase/migrations/20260810232405_fix_board_feed_rating_ambiguity.sql:40), [client cursor](C:/Users/tyler/Claude/SnackSquad/src/App.tsx:75).

Fix: pass timestamp plus ID and use the same tuple comparison as the ordering. Test more than one page of rows with an identical timestamp.

### 11. Show users their own badges

Badge rendering exists only in the public-profile branch. Selecting yourself routes to the private profile, which never loads or displays badges. The browser fixture confirmed no Badges heading on the user's own profile.

Evidence: [public-only badge section](C:/Users/tyler/Claude/SnackSquad/src/screens/ProfileScreen.tsx:86), [unused badge loader](C:/Users/tyler/Claude/SnackSquad/src/contestStore.ts:165).

Fix: load the current user's badges into their private profile and show current awards plus history. Test a user with an award, not only empty profiles.

### 12. Distinguish fabricated historical ratings from user ratings

The ratings migration assigns all existing logs a rotating 1–5 score using `row_number`, then defaults future omitted ratings to 3. These values are displayed as the poster's rating without provenance. Production migration history confirms this migration was applied. The audit did not count or identify affected individual logs.

Evidence: [synthetic rating backfill](C:/Users/tyler/Claude/SnackSquad/supabase/migrations/20260810181103_snack_log_ratings.sql:7), [displayed attribution](C:/Users/tyler/Claude/SnackSquad/src/screens/HomeScreen.tsx:220).

Fix: represent historical unknown ratings explicitly, or label seeded/demo ratings separately. Determine affected rows from reliable deployment/history evidence before any corrective update; do not indiscriminately erase later user-submitted ratings. Require explicit ratings for new member writes if that is the product rule.

### 13. Remove or wire up verified dead code

Two exported functions have test callers but no application callers: `deriveDisplayName` in [profile.ts](C:/Users/tyler/Claude/SnackSquad/src/profile.ts:31) and `getProfileBadges` in [contestStore.ts](C:/Users/tyler/Claude/SnackSquad/src/contestStore.ts:165). The latter duplicates the badge mapping in `loadPublicProfile` and could instead support finding 11. `.placeholder-screen` rules have no matching JSX surface in the current source.

Fix: remove the unused name helper if SQL remains authoritative; consolidate badge loading rather than deleting useful functionality; remove obsolete placeholder selectors. The normal and stricter unused-local/parameter TypeScript checks pass because they do not detect test-only exported functions. No wholly orphaned screen/component module was identified. Do not remove historical migrations just because their functions were superseded.

### 14. Reconcile product documentation

[README guardrails](C:/Users/tyler/Claude/SnackSquad/README.md:60) say there is no rating tracking, while ratings are required in the UI. [The backlog](C:/Users/tyler/Claude/SnackSquad/docs/backlog.md:40) marks CSV export complete, but `docs/testing.md` correctly states no export surface exists. Other old backlog entries describe superseded behavior.

Fix: update the README to the current product, mark missing functionality accurately, and distinguish archived decisions from the active backlog. CSV export and weekly-report UI should be explicit product decisions, not silently assumed finished work.

## Additional UI/UX improvements

These are lower-priority opportunities, separate from the defects above:

- **Restore expected browser navigation and focus.** App navigation uses `replaceState` and has no `popstate` listener. Back cannot walk through screens. Use history entries and restore focus to the main heading after navigation; preserve query parameters for league deep links.
- **Show dates on older activity.** The feed loads older entries but renders only time of day. Add Today/Yesterday/date labels and semantic `<time>` elements so old posts are not mistaken for today's activity.
- **Make the first log faster.** Provide recent/favorite snacks as direct choices and a “Log this” action beside a random recommendation. Preserve the rating requirement with a clear next step.
- **Reduce profile scanning.** In the mobile fixture, several empty sections create a long page. Prioritize account controls, today's logs and awards; collapse or shorten empty history/correction sections. Preserve usable loading and failure states rather than presenting failed loads as empty lists.
- **Offer recovery for deletion and mistakes.** Add an undo opportunity or brief confirmation for same-day deletion, with focus/status feedback. Surface actionable duplicate-log errors rather than the generic database-error fallback.
- **Make long histories explicit.** Personal logs, preferences and corrections are requested without pagination; API row limits can silently truncate them. Add “Load older” and a clear range/count before these datasets grow.
- **Decide whether to finish reports/export.** The backend weekly report feed has no current contest-screen entry point, and CSV export is absent. These are documented product gaps, not dead backend code: scheduled jobs still produce reports.

The mobile profile fixture had no horizontal overflow at 390px. Existing focus-visible styles, semantic labels, a skip link and reduced-motion CSS are good foundations. This was not a full WCAG conformance audit or a complete keyboard/screen-reader review.

## Security coverage and residual checks

- All inspected production `public` tables have RLS enabled. No inspected public SECURITY DEFINER function was executable by `anon`; their search paths were fixed. Service-only import, notification and bot-control RPCs were not executable by normal signed-in members.
- Sensitive member RPCs inspected include moderator gates for corrections/merges and league-membership checks for Fantasy overview. A SECURITY DEFINER warning alone is not proof of a vulnerability; inspect both grants and the function body. [Supabase function security guidance](https://supabase.com/docs/guides/database/functions).
- The production security advisor returned 22 warnings about intentionally callable authenticated SECURITY DEFINER functions, 20 informational RLS-without-policy notices, and one leaked-password-protection warning. Tables accessed only through restricted RPCs can intentionally have no direct row policies. Do not add broad policies merely to clear the advisor. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- Leaked password protection is disabled. Its urgency depends on whether production password sign-in remains usable alongside magic links; that Auth setting was not verified in this audit. [Password protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- The local configuration enables the company-domain signup hook and disables anonymous signup. Production Auth hook activation, email-change/offboarding policy, SMTP and endpoint rate-limit settings still need an operational check; database metadata alone does not prove those settings. The metadata Edge Function has authentication and timeouts but no application-level per-user quota in its source.
- Browser code uses a publishable key. The checked tracked-file list includes env examples, not local credential files. This was not an exhaustive scan of Git history for secrets.
- RSS article links are origin-validated, React renders text rather than raw HTML, and production header configuration includes CSP, frame restrictions and a no-referrer policy. Deployed response headers were not independently measured.

## Coverage

**Passed:** TypeScript; TypeScript with unused locals/parameters enabled; all 13 commands in `npm test`; production build; `npm audit --json` with zero reported vulnerabilities. Build output was 425.88 kB JavaScript (120.68 kB gzip) and 34.19 kB CSS (7.20 kB gzip).

**Browser evidence:** real React app with mocked Supabase responses, 1440px desktop and 390px mobile; sign-out reachability, own-profile badges, existing-member league controls, visibility refresh, delayed league switch and failed Fantasy bootstrap. See [ui-checks.json](C:/Users/tyler/Claude/SnackSquad/docs/audits/2026-09-05/ui-checks.json) and screenshots in this directory. The fixture has no production credentials and makes no production writes.

**Production read-only checks:** security advisors, RLS policies, trigger/constraint definitions, privileged function execution permissions, timestamp column privileges and selected migration history. No production inserts, updates, deletes, emails or deployments were performed.

**Not run:** full local database/pgTAP or the existing authenticated E2E suite. The running local Supabase containers belong to another project, and this audit did not reset or repurpose them. No full load test, historical-secret scan, live Auth configuration audit, or comprehensive accessibility certification is claimed.

Review lenses were applied sequentially in this task, following the project's agent mapping. No independent cross-model review ran. Findings were checked against current definitions and call paths; six functional defects were additionally reproduced with browser fixtures. A suspected mobile test-selector issue was rejected after verifying Playwright's hidden-element filtering.

## Verdict

Prioritize findings **1–4** before expanding Fantasy use: trusted timestamps, resilient bootstrap, refresh of shared state, and safe league switching. Then complete mobile account access and league/queue/profile flows (**5–11**). Resolve historical rating provenance carefully (**12**), then clean up unused code and documentation (**13–14**).

This is a report-only audit. Application code and production state were not changed.
