import assert from "node:assert/strict";

let handler: ((request: Request) => Promise<Response>) | undefined;
const denoGlobal = globalThis as typeof globalThis & { Deno?: unknown };
denoGlobal.Deno = {
  env: { get: (name: string) => ({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
    RESEND_API_KEY: "resend-key",
    FANTASY_EMAIL_FROM: "Fantasy <fantasy@example.com>",
    SITE_URL: "https://snacks.example.com",
  } as Record<string, string>)[name] },
  serve: (next: typeof handler) => { handler = next; },
};

const calls: Array<{ url: string; options?: RequestInit }> = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  calls.push({ url: String(input), options });
  const path = new URL(String(input)).pathname;
  if (path.endsWith("/claim_fantasy_notifications")) return Response.json([{
    id: "notice-1", kind: "turn_reminder", delivery_email: "delivered+bot1@resend.dev",
    league_id: "league-1", league_name: "Crunch Club", pick_number: 4, pick_deadline: "2026-07-06T16:00:00Z",
  }]);
  if (path === "/emails") return Response.json({ id: "email-1" });
  return Response.json(null);
};

const { emailFor } = await import("./index");
assert(handler);
const message = emailFor({ id: "n", kind: "turn_started", delivery_email: "bot@example.com", league_id: "l1", league_name: "Club", pick_number: 1, pick_deadline: "2026-07-06T16:00:00Z" }, "https://snacks.example.com", "Fantasy <f@example.com>");
assert.match(message.subject, /Your turn/);
assert.match(message.text, /view=fantasy&league=l1/);

assert.equal((await handler(new Request("http://local", { method: "POST" }))).status, 401);
const response = await handler(new Request("http://local", { method: "POST", headers: { Authorization: "Bearer service-key" } }));
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { claimed: 1, sent: 1 });
const send = calls.find((call) => new URL(call.url).pathname === "/emails");
assert.equal((send?.options?.headers as Record<string,string>)["Idempotency-Key"], "notice-1");
assert.match(String(send?.options?.body), /delivered\+bot1@resend.dev/);

globalThis.fetch = originalFetch;
delete denoGlobal.Deno;
console.log("fantasy notification Edge Function tests passed");
