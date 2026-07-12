# Auth Setup

Snack Squad uses Supabase email magic links. Anonymous sign-in is disabled, and the database Before User Created hook rejects every ordinary account outside `@carnegiehighered.com`. The service-role bot runner may create synthetic non-company accounts only with protected `app_metadata.snack_squad_test_bot`; browser `user_metadata` cannot grant that exception.

## Local development

1. Start Docker Desktop.
2. Run `npm.cmd exec -- supabase start` from the repository root.
3. Run `npm.cmd exec -- supabase db reset` to apply all migrations and install the auth hook.
4. Start the app with `npm.cmd run dev`.
5. Open Mailpit at `http://127.0.0.1:54324` to follow local magic links.

The local callback allowlist includes `http://127.0.0.1:5173` and `http://localhost:5173`. Do not enable anonymous sign-ins.

## Hosted pilot setup

Complete these steps in the non-production test project first, then repeat them during the coordinated pilot cutover:

1. Apply the overhaul migrations only alongside the compatible frontend. The first migration intentionally stops if any legacy application table contains rows.
2. In **Authentication > Hooks**, enable **Before User Created** and choose the Postgres function `public.before_user_created_hook`.
3. In **Authentication > URL Configuration**, set the production site URL and add every exact production and preview callback URL that may receive a magic link.
4. In **Authentication > Providers > Email**, keep email signups enabled and anonymous sign-ins disabled.
5. Configure custom SMTP before inviting the pilot team; Supabase's default mail service is not intended for a company pilot.
6. Send one magic link to an eligible company address and verify sign-in, profile creation, and sign-out.
7. Attempt sign-up with a non-company address and verify Auth rejects it before creating a user.
8. Keep the service-role key limited to the notification function and the operator machine; never add the bot marker to browser signup code.

## Moderator designation

Moderator status is stored in `public.moderators`, not user-editable metadata. After the moderator has signed in once, add their Auth user ID with a controlled SQL operation:

```sql
insert into public.moderators (user_id)
values ('AUTH-USER-ID-HERE')
on conflict (user_id) do nothing;
```

Never expose the service-role key in the browser. Regular members can suggest metadata corrections later, but only rows in `public.moderators` can change canonical snack metadata or feature flags.
