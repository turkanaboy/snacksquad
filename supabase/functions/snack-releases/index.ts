import { parseSnackReleaseFeed } from "./feed.ts";

const feedUrl = "https://www.snackandbakery.com/rss/topic/6053-new-snack-and-bakery-products";

const env = (name: string) => Deno.env.get(name)?.trim();
const json = (body: unknown, status = 200) => Response.json(body, { status });

function defaultKey(name: string) {
  const dictionary = env(name);
  if (!dictionary) return;
  try {
    const parsed = JSON.parse(dictionary) as Record<string, unknown>;
    const key = parsed?.default;
    return typeof key === "string" && key.trim() ? key.trim() : undefined;
  } catch {
    return;
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const supabaseUrl = env("SUPABASE_URL");
  const serviceKeys = [
    env("SUPABASE_SECRET_KEY"),
    defaultKey("SUPABASE_SECRET_KEYS"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
  ].filter((key): key is string => Boolean(key));
  const serviceKey = serviceKeys[0];
  const cronSecret = env("FANTASY_CRON_SECRET");
  if (!supabaseUrl || !serviceKey) return json({ error: "Release feed is not configured." }, 503);
  const serviceAuthorized = serviceKeys.some((key) => request.headers.get("Authorization") === `Bearer ${key}`);
  const cronAuthorized = Boolean(cronSecret) && request.headers.get("X-Snack-Release-Cron-Secret") === cronSecret;
  if (!serviceAuthorized && !cronAuthorized) {
    return json({ error: "Unauthorized." }, 401);
  }

  try {
    const feedResponse = await fetch(feedUrl, {
      headers: { Accept: "application/rss+xml, application/xml;q=0.9", "User-Agent": "SnackSquad release feed" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!feedResponse.ok) throw new Error(`RSS source returned HTTP ${feedResponse.status}`);
    const releases = parseSnackReleaseFeed(await feedResponse.text());
    if (!releases.length) throw new Error("RSS source returned no valid releases");

    const headers: Record<string, string> = {
      apikey: serviceKey,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    };
    if (serviceKey.split(".").length === 3) headers.Authorization = `Bearer ${serviceKey}`;
    const upsertResponse = await fetch(`${supabaseUrl}/rest/v1/snack_releases?on_conflict=article_url`, {
      method: "POST",
      headers,
      body: JSON.stringify(releases),
      signal: AbortSignal.timeout(10_000),
    });
    if (!upsertResponse.ok) throw new Error(`Release upsert returned HTTP ${upsertResponse.status}`);
    return json({ imported: releases.length });
  } catch (error) {
    console.error("Snack release feed refresh failed", error);
    return json({ error: "Could not refresh snack releases." }, 502);
  }
});
