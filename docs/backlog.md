# Snack Squad Backlog

## Launch Blocker

- [x] Keep Supabase anonymous sign-ins disabled for the pilot.

## MVP Polish

- [x] Add an empty-state example snack suggestion.
- [x] Show clearer errors for missing Supabase config vs hosted auth/config failures.
- [x] Add a small "copied from Slack" source note field after users ask for source tracking.
- [x] Add basic mobile spacing pass after the first real team test.

## Slack Loop

- [ ] Post a Slack message when a new snack is suggested after Slack app credentials exist.
- [ ] Add a Slack slash command or shortcut for submitting a snack after Slack app credentials exist.
- [ ] Consider Slack sign-in if company email magic links need an alternative.

## Snack Metadata

- [x] Add optional image URL preview validation.
- [x] Add simple duplicate suggestions beyond exact normalized names.
- [x] Add a USDA FoodData Central lookup adapter.
- [x] Route USDA FoodData Central lookup through an authenticated Supabase Edge Function.

## Culture Features

- [x] Pick of the day.
- [x] Weekly bracket nominations.
- [x] Weekly bracket voting.
- [x] Personal snack rating log.
- [x] Badge/superlative definitions.
- [x] Badge awarding UI.

## Admin

- [x] Add moderator snack cleanup through the authorized merge RPC.
- [x] Add an archive view for old snacks.
- [ ] Add export to CSV if the snack board becomes useful history; there is currently no export UI.

## Current follow-ups

- [ ] Surface Friday reports in the application; database reporting exists, but no screen presents it.
- [ ] Add browser Back/Forward navigation and intentional focus placement between screens.
- [ ] Add profile history pagination if longer histories make the page difficult to use.
- [ ] Consider logging directly from favorite/random snack cards and undo for deleted logs.

Earlier completed entries describe historical milestones, not a guarantee that every original UI survived subsequent redesigns. See `docs/audits/2026-09-05/` for the current audit and remediation evidence.
