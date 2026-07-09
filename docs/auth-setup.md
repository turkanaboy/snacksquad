# Auth Setup

## Current Mode

Snack Squad currently uses Supabase anonymous sessions plus a typed display name.

## Magic Link Prep

1. In Supabase Auth, configure the production site URL after the Vercel domain is connected.
2. Add the Vercel preview and production callback URLs to the allowed redirect URLs.
3. Paste `docs/magic-link-email.html` into the magic-link email template.
4. Keep anonymous auth enabled until magic-link login is fully wired and tested.

## Later App Work

- Add an email input and `signInWithOtp`.
- Preserve the existing display-name field.
- Decide whether old anonymous snack ownership should remain device-local or be migrated manually.
