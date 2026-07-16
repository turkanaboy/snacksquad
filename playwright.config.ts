import { defineConfig, devices } from "@playwright/test";

const hostedBaseUrl = process.env.E2E_HOSTED_BASE_URL;
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!hostedBaseUrl && (!supabaseUrl || !supabaseKey || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
  throw new Error("Local E2E requires SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY from `supabase status -o env`.");
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["line"], ["html", { open: "never" }]],
  use: {
    baseURL: hostedBaseUrl || "http://127.0.0.1:5173",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: hostedBaseUrl ? undefined : {
    command: "npm run dev -- --host 127.0.0.1",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      VITE_SUPABASE_URL: supabaseUrl!,
      VITE_SUPABASE_PUBLISHABLE_KEY: supabaseKey!,
    },
  },
  projects: [
    {
      name: "desktop-chromium",
      testIgnore: /production-smoke\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      testIgnore: /production-smoke\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "production-smoke",
      testMatch: /production-smoke\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
