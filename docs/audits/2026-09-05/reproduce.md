# Reproduce the isolated UI checks

Run from the SnackSquad repository root. This fixture uses fake Auth/session data and intercepts requests to its fake Supabase host; it does not use production data or credentials.

In one PowerShell terminal:

```powershell
$env:VITE_SUPABASE_URL = 'https://audit-fixture.supabase.co'
$env:VITE_SUPABASE_PUBLISHABLE_KEY = 'audit-placeholder'
npm.cmd run dev -- --host 127.0.0.1 --port 5189 --strictPort
```

In another terminal, with dependencies and Playwright Chromium already installed:

```powershell
node docs/audits/2026-09-05/audit-ui.mjs
```

The script writes screenshots and `ui-checks.json` to this directory. Stop the Vite process after the checks. These checks record known defects; they are an audit reproduction, not a replacement for the repository's E2E suite or a green regression gate.
