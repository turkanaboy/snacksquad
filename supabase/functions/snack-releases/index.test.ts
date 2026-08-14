import assert from "node:assert/strict";
import { parseSnackReleaseFeed } from "./feed";

const sampleFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><item>
  <title><![CDATA[Oreo unveils trio &amp; more]]></title>
  <description><![CDATA[<p>Three new limited-edition cookie flavors.</p>]]></description>
  <pubDate>Thu, 13 Aug 2026 10:00:00 -0400</pubDate>
  <link>https://www.snackandbakery.com/articles/116154-oreo-unveils-trio</link>
</item></channel></rss>`;

const duplicateFeed = sampleFeed.replace("</channel>", `${sampleFeed.match(/<item>[\s\S]*<\/item>/)?.[0]}</channel>`);

assert.deepEqual(parseSnackReleaseFeed(sampleFeed), [{
  title: "Oreo unveils trio & more",
  brand: null,
  summary: "Three new limited-edition cookie flavors.",
  article_url: "https://www.snackandbakery.com/articles/116154-oreo-unveils-trio",
  published_at: "2026-08-13",
}]);
assert.equal(parseSnackReleaseFeed(duplicateFeed).length, 1);

let handler: ((request: Request) => Promise<Response>) | undefined;
const denoGlobal = globalThis as typeof globalThis & { Deno?: unknown };
denoGlobal.Deno = {
  env: { get: (name: string) => ({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SECRET_KEY: "secret-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
    FANTASY_CRON_SECRET: "cron-secret",
  } as Record<string, string>)[name] },
  serve: (nextHandler: typeof handler) => { handler = nextHandler; },
};

const calls: Array<{ url: string; options?: RequestInit }> = [];
const originalFetch = globalThis.fetch;
let feedStatus = 200;
let feedBody = sampleFeed;
let upsertStatus = 200;
globalThis.fetch = async (input, options) => {
  calls.push({ url: String(input), options });
  if (String(input).includes("snackandbakery.com/rss/")) {
    return new Response(feedBody, { status: feedStatus, headers: { "Content-Type": "application/xml" } });
  }
  return Response.json(null, { status: upsertStatus });
};

await import("./index");
assert(handler);
assert.equal((await handler(new Request("http://local"))).status, 405);
assert.equal((await handler(new Request("http://local", { method: "POST" }))).status, 401);
const response = await handler(new Request("http://local", {
  method: "POST",
  headers: { "X-Snack-Release-Cron-Secret": "cron-secret" },
}));
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { imported: 1 });

const upsert = calls.find((call) => String(call.url).includes("/rest/v1/snack_releases"));
assert(upsert);
assert.equal(new URL(upsert.url).searchParams.get("on_conflict"), "article_url");
assert.equal((upsert.options?.headers as Record<string, string>).Prefer, "resolution=merge-duplicates");
assert.deepEqual(JSON.parse(String(upsert.options?.body)), parseSnackReleaseFeed(sampleFeed));

feedStatus = 503;
assert.equal((await handler(new Request("http://local", {
  method: "POST",
  headers: { "X-Snack-Release-Cron-Secret": "cron-secret" },
}))).status, 502);
feedStatus = 200;
feedBody = "<rss><channel></channel></rss>";
assert.equal((await handler(new Request("http://local", {
  method: "POST",
  headers: { "X-Snack-Release-Cron-Secret": "cron-secret" },
}))).status, 502);
feedBody = sampleFeed;
upsertStatus = 500;
assert.equal((await handler(new Request("http://local", {
  method: "POST",
  headers: { Authorization: "Bearer secret-key" },
}))).status, 502);

globalThis.fetch = originalFetch;
delete denoGlobal.Deno;
console.log("snack release RSS Edge Function tests passed");
