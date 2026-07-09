# Snack Squad

Remote-office snack board for suggestions, votes, and comments.

## Setup

1. Create a Supabase project and enable anonymous sign-ins in Auth settings.
2. Copy `.env.example` to `.env.local`.
3. Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
4. Apply `supabase/migrations/001_initial_snack_squad.sql` with `supabase db push` or the hosted SQL editor. If the first migration was already run, apply each later numbered migration in order.
5. Install and run:

```bash
npm install
npm test
npm run typecheck
npm run build
npm run dev
```

## Current Features

- Shared snack board with anonymous session ownership and typed display names.
- Snack suggestions, duplicate nudges, votes, comments, and author-owned cleanup.
- Image URL previews, optional source notes, pick of the day, weekly local bracket voting, personal ratings, derived badges, archive view, and CSV export.

## Guardrails

V1 does not include Slack integration, user-facing login, Storage uploads, Realtime, product lookup APIs, purchasing, stocking, approval workflows, or role-based moderation.

Never put a Supabase service-role or secret key in `.env.local` for this browser app.

Magic-link prep lives in `docs/auth-setup.md`; the email template is `docs/magic-link-email.html`.
