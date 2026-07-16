import { expect, type Browser, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const users = {
  alex: { id: "10000000-0000-0000-0000-000000000001", email: "alex.morgan@carnegiehighered.com" },
  jordan: { id: "10000000-0000-0000-0000-000000000002", email: "jordan.lee@carnegiehighered.com" },
  priya: { id: "10000000-0000-0000-0000-000000000003", email: "priya.shah@carnegiehighered.com" },
  marcus: { id: "10000000-0000-0000-0000-000000000004", email: "marcus.chen@carnegiehighered.com" },
} as const;

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Load local values from \`supabase status -o env\`.`);
  return value;
};

export const supabaseUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || required("SUPABASE_URL");
export const anonKey = () => process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || required("SUPABASE_ANON_KEY");

export const admin = () => createClient(supabaseUrl(), required("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const clients = new Map<string, Promise<SupabaseClient>>();

export async function signIn(page: Page, email: string, destination = "/") {
  const client = await userClient(email);
  const result = await client.auth.getSession();
  if (result.error || !result.data.session) throw result.error || new Error("Local test session was not created.");
  await page.addInitScript((session) => localStorage.setItem("sb-127-auth-token", JSON.stringify(session)), result.data.session);
  await page.goto(destination);
  await expect(page.getByRole("navigation", { name: "Primary navigation" }).first()).toBeVisible();
}

export async function signedInPage(browser: Browser, email: string, destination = "/") {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, email, destination);
  return { context, page };
}

export async function userClient(email: string) {
  const existing = clients.get(email);
  if (existing) return existing;
  const pending = authenticate(email);
  clients.set(email, pending);
  try {
    return await pending;
  } catch (error) {
    clients.delete(email);
    throw error;
  }
}

async function authenticate(email: string) {
  const client = createClient(supabaseUrl(), anonKey(), { auth: { persistSession: false, autoRefreshToken: false } });
  let lastError: unknown;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const result = await client.auth.signInWithPassword({ email, password: "snacksquad" });
      if (!result.error) return client;
      lastError = result.error;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw lastError || new Error("Local Auth did not become ready.");
}
