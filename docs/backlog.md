# Snack Squad Backlog

## Launch Blocker

- [ ] Enable Supabase anonymous sign-ins in Auth settings.

## MVP Polish

- [x] Add an empty-state example snack suggestion.
- [x] Show clearer errors for missing Supabase config vs hosted auth/config failures.
- [x] Add a small "copied from Slack" source note field after users ask for source tracking.
- [x] Add basic mobile spacing pass after the first real team test.

## Slack Loop

- [ ] Post a Slack message when a new snack is suggested after Slack app credentials exist.
- [ ] Add a Slack slash command or shortcut for submitting a snack after Slack app credentials exist.
- [ ] Consider Slack sign-in only if anonymous sessions become confusing across devices.

## Snack Metadata

- [x] Add optional image URL preview validation.
- [x] Add simple duplicate suggestions beyond exact normalized names.
- [x] Add Open Food Facts lookup adapter skeleton.
- [x] Route Open Food Facts lookup through an authenticated Supabase Edge Function.

## Culture Features

- [x] Pick of the day.
- [x] Weekly bracket nominations.
- [x] Weekly bracket voting.
- [x] Personal snack rating log.
- [x] Badge/superlative definitions.
- [x] Badge awarding UI.

## Admin

- [ ] Add a lightweight moderator cleanup path only after choosing a real admin identity model.
- [x] Add an archive view for old snacks.
- [x] Add export to CSV if the snack board becomes useful history.
