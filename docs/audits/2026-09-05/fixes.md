# Audit remediation

Implemented on `codex/audit-fixes`, following the September 5 project audit. Changes are local and uncommitted; production has not been changed. The original report and evidence remain a record of the audited version.

## Finding disposition

| Finding | Local remediation |
|---|---|
| 1 — scoring timestamps | Removed member table-level log write/upvote insert grants and granted only editable columns. Server defaults own event times; service-role historical fixtures remain supported. |
| 2 — blocked bootstrap | Profile loading is independent of Fantasy availability. Profile failures expose Retry and Sign out; optional Fantasy failure leaves logging usable. Account changes discard cached profile data. |
| 3 — stale shared state | Home and Bracket refresh every 30 seconds while visible; Fantasy refreshes every 15 seconds. Focus/visibility changes and manual controls refresh immediately. Home also refreshes on return. |
| 4 — league switch races | Responses carry request generations, mismatched overviews cannot render season actions, and selection clears league-specific queue/search state. Mutations lock switching. |
| 5 — mobile sign-out | Own Profile exposes Sign out at every viewport size; failures are displayed. |
| 6 — additional leagues | Existing members can open create/join forms and switch to their new league. |
| 7 — saved queues | Overview returns only the viewer's ranked queue. Reload hydrates it, unsaved local changes survive refresh, switching seasons resets it, and Save persists an empty queue. |
| 8 — merge integrity | Merge moves preferences transactionally; the most recently updated sentiment wins conflicts. Nullable snack relationships no longer crash mapping. Already-stranded legacy preferences are safely omitted; this migration does not guess their intended destination. |
| 9 — committed votes | Per-entry in-flight locks prevent duplicate toggles. Only mutation failure rolls back; ranking-read failure reports that the vote was saved. Stale core reads cannot overwrite optimistic state. |
| 10 — tied pagination | New `board_feed_page` uses timestamp and UUID as its cursor. The older RPC is retained for cached clients. |
| 11 — own badges | Private Profile loads and displays badge tenure history, using the previously unused shared loader. |
| 12 — historical rating provenance | Mitigated: existing numbers are preserved as `legacy_unknown` and visibly labeled unverified. New UI writes include `rating_source = 'user'`. Historical originals cannot be reconstructed from the current database alone. |
| 13 — dead code | Removed unused display-name derivation and obsolete placeholder CSS; reused badge loading. Strict unused-symbol compilation passes. |
| 14 — documentation | Corrected rating guardrails, CSV status, moderator cleanup status, and local testing instructions. Optional product ideas remain explicit backlog items. |

## Validation

- All 13 existing unit-test commands pass, including new cursor/null-relationship/provenance assertions.
- Production build passes; TypeScript with `--noUnusedLocals --noUnusedParameters` passes.
- Fresh local migration replay passes. All nine pgTAP files pass: **230 assertions**, including 24 new permission, timestamp, pagination, provenance, merge and private-queue assertions.
- Final Chromium browser suite: **26 passed, 2 intentionally skipped** (mobile duplicates of the real magic-link and four-manager lifecycle scenarios). Includes the eight new desktop/mobile regression cases, real local vote persistence, and another manager observing lobby/draft changes without reloading.
- Desktop and Pixel 7 captures were visually inspected; Profile and expanded league forms have no horizontal overflow. Evidence: `fixed-desktop-profile.png`, `fixed-mobile-profile.png`, `fixed-desktop-fantasy.png`, and `fixed-mobile-fantasy.png` alongside this note.
- Database/browser writes used only the isolated `SnackSquadAudit` Docker stack (API 55321 / database 55322), avoiding the other local project's ports. Browser regressions combine real local persistence with controlled failed/delayed responses.

## Rollout

Apply `supabase/migrations/20260906010048_audit_integrity_and_preferences.sql` before deploying this frontend: it needs the new column and feed RPC. Then verify sign-in, log creation/replacement, voting, profile badges, and Fantasy queues on the deployed build. The retained old feed RPC supports the previous frontend during rollout; older clients that omit provenance conservatively produce unverified ratings.

No historical ratings were deleted or reassigned. Identifying genuine historical ratings would require an authoritative external record. The migration does not retroactively identify manipulated scoring events or reconstruct previously stranded preferences. These are data-reconciliation limitations, not a claim that historical production data was audited row by row.

If the frontend must be rolled back, keep the additive migration and timestamp restrictions. Do not restore vulnerable table-wide grants merely to undo the UI. Polling refreshes displayed state; server jobs remain responsible for advancing expired drafts.

Broader suggestions such as CSV export, Friday report UI, navigation history, and quick logging are tracked in `docs/backlog.md`; they are not implemented features.
