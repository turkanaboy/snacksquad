type Notification = {
  id: string;
  kind: "turn_started" | "turn_reminder";
  delivery_email: string;
  league_id: string;
  league_name: string;
  pick_number: number;
  pick_deadline: string;
};

const env = (name: string) => Deno.env.get(name)?.trim();
const json = (body: unknown, status = 200) => Response.json(body, { status });

async function rpc(name: string, body: unknown, url: string, key: string) {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`${name} failed with HTTP ${response.status}`);
  return response.json();
}

export function emailFor(notification: Notification, siteUrl: string, from: string) {
  const deadline = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(notification.pick_deadline));
  const link = new URL(siteUrl);
  link.searchParams.set("view", "fantasy");
  link.searchParams.set("league", notification.league_id);
  const reminder = notification.kind === "turn_reminder";
  const subject = reminder ? `30 minutes left to pick in ${notification.league_name}` : `Your turn to pick in ${notification.league_name}`;
  const text = `${subject}\n\nPick ${notification.pick_number} is due ${deadline}.\n${link}`;
  return { from, to: [notification.delivery_email], subject, text };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const supabaseUrl = env("SUPABASE_URL");
  const serviceKeys = [env("SUPABASE_SECRET_KEY"), env("SUPABASE_SERVICE_ROLE_KEY")].filter((key): key is string => Boolean(key));
  const serviceKey = serviceKeys[0];
  const cronSecret = env("FANTASY_CRON_SECRET");
  const resendKey = env("RESEND_API_KEY");
  const from = env("FANTASY_EMAIL_FROM");
  const siteUrl = env("SITE_URL");
  if (!supabaseUrl || !serviceKey || !resendKey || !from || !siteUrl) return json({ error: "Notification delivery is not configured." }, 503);
  const serviceAuthorized = serviceKeys.some((key) => request.headers.get("Authorization") === `Bearer ${key}`);
  const cronAuthorized = Boolean(cronSecret) && request.headers.get("X-Fantasy-Cron-Secret") === cronSecret;
  if (!serviceAuthorized && !cronAuthorized) return json({ error: "Unauthorized." }, 401);

  const leaseToken = crypto.randomUUID();
  let notifications: Notification[];
  try {
    notifications = await rpc("claim_fantasy_notifications", { p_limit: 20, p_at: new Date().toISOString(), p_lease_token: leaseToken }, supabaseUrl, serviceKey) as Notification[];
  } catch (error) {
    console.error("Fantasy notification claim failed", error);
    return json({ error: "Could not claim notifications." }, 502);
  }

  let sent = 0;
  for (const notification of notifications) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json", "Idempotency-Key": notification.id },
        body: JSON.stringify(emailFor(notification, siteUrl, from)),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error(`Resend returned HTTP ${response.status}`);
      const result = await response.json() as { id?: unknown };
      if (typeof result.id !== "string") throw new Error("Resend returned no message id");
      await rpc("complete_fantasy_notification", { p_id: notification.id, p_lease_token: leaseToken, p_provider_message_id: result.id }, supabaseUrl, serviceKey);
      sent++;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown delivery failure";
      const nextAttempt = new Date(Date.now() + 60_000).toISOString();
      try {
        await rpc("fail_fantasy_notification", { p_id: notification.id, p_lease_token: leaseToken, p_error: message, p_next_attempt_at: nextAttempt }, supabaseUrl, serviceKey);
      } catch (recordError) {
        console.error("Fantasy notification failure could not be recorded", recordError);
      }
    }
  }
  return json({ claimed: notifications.length, sent });
});
