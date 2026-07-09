# Snack Squad

Remote-office snack board for suggestions, votes, and comments.

## Setup

1. Create a Supabase project and enable anonymous sign-ins in Auth settings.
2. Copy `.env.example` to `.env.local`.
3. Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
4. Apply `supabase/migrations/001_initial_snack_squad.sql` with `supabase db push` or the hosted SQL editor. If the first migration was already run before `002_api_grants.sql` existed, run that follow-up SQL too.
5. Install and run:

```bash
npm install
npm test
npm run typecheck
npm run build
npm run dev
```

## MVP Guardrails

V1 includes the shared snack board, anonymous session ownership, typed display names, suggestions, duplicate nudges, votes, comments, and author-owned cleanup.

V1 does not include Slack integration, user-facing login, Storage uploads, Realtime, product lookup APIs, brackets, badges, personal snack logs, purchasing, stocking, or approval workflows.

Never put a Supabase service-role or secret key in `.env.local` for this browser app.
