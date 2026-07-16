# Testing

Snack Squad uses the smallest test layer that proves each contract. Browser mutations run only against reset local data; hosted smoke never clicks mutation controls.

## Local browser E2E

Prerequisites: Docker Desktop, Node 22, and dependencies installed by `npm ci`.

```powershell
npm.cmd exec -- supabase start
npm.cmd exec -- supabase db reset --local --yes
$s = npm.cmd exec -- supabase status -o json | ConvertFrom-Json
$env:SUPABASE_URL = $s.API_URL
$env:SUPABASE_ANON_KEY = $s.ANON_KEY
$env:SUPABASE_SERVICE_ROLE_KEY = $s.SERVICE_ROLE_KEY
npm.cmd run test:e2e
```

The service-role value is used only by Node-side local fixtures. It must never be supplied to hosted smoke or browser code. Failures retain `playwright-report/` and `test-results/`.

## Hosted smoke

```powershell
$env:E2E_HOSTED_BASE_URL = "https://approved-host.example"
Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
npm.cmd run test:e2e:production
```

This verifies deployment reachability, HTML delivery, the Auth or authenticated shell, and refresh behavior. It does not prove production writes.

## Coverage ownership

| Contract | Owning proof |
|---|---|
| R1-R5 | Playwright harness, seeded CI job, this matrix |
| R6-R8 | `e2e/auth.spec.ts`, `e2e/core.spec.ts`, Auth/RLS pgTAP |
| R9-R12 | `e2e/core.spec.ts`, existing snack/profile/metadata tests |
| R13 | `e2e/competitions.spec.ts`, bracket pgTAP |
| R14-R16 | `e2e/competitions.spec.ts`, Fantasy pgTAP, `npm run fantasy:bot -- run --local` |
| R17-R19 | desktop/mobile Playwright projects and retained failure diagnostics |
| R20-R22 | documented commands, hosted smoke, and explicit mismatch reporting below |

## Current product mismatches

- CSV export has no reachable application surface; no test pretends otherwise.
- Friday report data has no current contest-screen feed; database coverage remains authoritative.
- Mobile Fantasy navigation was restored with the E2E suite and is covered in both responsive projects.

Firefox, WebKit, visual snapshots, load tests, and production mutation automation remain deferred until evidence justifies their cost.
