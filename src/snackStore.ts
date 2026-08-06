import type { SupabaseClient } from "@supabase/supabase-js";

export type BoardEntry = {
  id: string;
  snackId: string;
  snackName: string;
  category: string;
  imageUrl: string | null;
  loggerId: string;
  loggerName: string;
  loggedAt: string;
  upvoteCount: number;
  viewerUpvoted: boolean;
};

export type LeaderboardItem = {
  snackId: string;
  snackName: string;
  category: string;
  logCount: number;
  upvoteCount: number;
};

export type MySnackLog = {
  id: string;
  snackId: string;
  loggedAt: string;
  loggedOn: string;
  snackName: string;
  category: string;
};

export type RandomSnack = {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  imageUrl: string | null;
};

export type SnackPreference = RandomSnack & {
  sentiment: -1 | 1;
};

export type SnackRelease = {
  id: string;
  title: string;
  brand: string | null;
  summary: string | null;
  articleUrl: string | null;
  publishedAt: string;
};

export function mapBoardEntry(row: Record<string, unknown>): BoardEntry {
  return {
    id: String(row.log_id),
    snackId: String(row.snack_id),
    snackName: String(row.snack_name),
    category: String(row.category),
    imageUrl: typeof row.image_url === "string" ? row.image_url : null,
    loggerId: String(row.logger_id),
    loggerName: String(row.logger_name),
    loggedAt: String(row.logged_at),
    upvoteCount: Number(row.upvote_count),
    viewerUpvoted: Boolean(row.viewer_upvoted),
  };
}

export function mapLeaderboardItem(row: Record<string, unknown>): LeaderboardItem {
  return {
    snackId: String(row.snack_id),
    snackName: String(row.snack_name),
    category: String(row.category),
    logCount: Number(row.log_count),
    upvoteCount: Number(row.upvote_count),
  };
}

export function mapRandomSnack(row: Record<string, unknown>): RandomSnack {
  return {
    id: String(row.id),
    name: String(row.name),
    brand: typeof row.brand === "string" ? row.brand : null,
    category: String(row.category),
    imageUrl: typeof row.image_url === "string" ? row.image_url : null,
  };
}

export function mapSnackPreference(row: Record<string, unknown>): SnackPreference {
  const snack = row.snacks as Record<string, unknown>;
  return { ...mapRandomSnack(snack), sentiment: Number(row.sentiment) === 1 ? 1 : -1 };
}

export function mapSnackRelease(row: Record<string, unknown>): SnackRelease {
  return {
    id: String(row.id),
    title: String(row.title),
    brand: typeof row.brand === "string" ? row.brand : null,
    summary: typeof row.summary === "string" ? row.summary : null,
    articleUrl: typeof row.article_url === "string" ? row.article_url : null,
    publishedAt: String(row.published_at),
  };
}

type RpcClient = Pick<SupabaseClient, "rpc">;
type DataClient = Pick<SupabaseClient, "auth" | "from">;

export async function getBoard(client: RpcClient, limit = 30, before: string | null = null): Promise<BoardEntry[]> {
  const result = await client.rpc("board_feed", { p_limit: limit, p_before: before });
  if (result.error) throw result.error;
  return ((result.data || []) as Record<string, unknown>[]).map(mapBoardEntry);
}

export async function getLeaderboard(client: RpcClient, days = 30, limit = 10): Promise<LeaderboardItem[]> {
  const result = await client.rpc("snack_leaderboard", { p_days: days, p_limit: limit });
  if (result.error) throw result.error;
  return ((result.data || []) as Record<string, unknown>[]).map(mapLeaderboardItem);
}

export async function getMySnackLogs(client: Pick<SupabaseClient, "from">): Promise<MySnackLog[]> {
  const result = await client
    .from("snack_logs")
    .select("id,snack_id,logged_at,logged_on,snacks(name,category)")
    .order("logged_at", { ascending: false });
  if (result.error) throw result.error;
  return (result.data || []).map((row) => {
    const snack = row.snacks as unknown as { name: string; category: string };
    return {
      id: row.id,
      snackId: row.snack_id,
      loggedAt: row.logged_at,
      loggedOn: row.logged_on,
      snackName: snack.name,
      category: snack.category,
    };
  });
}

export async function getRandomSnack(client: Pick<SupabaseClient, "from">): Promise<RandomSnack | null> {
  const countResult = await client.from("snacks").select("id", { count: "exact", head: true });
  if (countResult.error) throw countResult.error;
  if (!countResult.count) return null;
  const offset = Math.floor(Math.random() * countResult.count);
  const result = await client
    .from("snacks")
    .select("id,name,brand,category,image_url")
    .order("id")
    .range(offset, offset)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data ? mapRandomSnack(result.data) : null;
}

export async function getMySnackPreferences(client: Pick<SupabaseClient, "from">): Promise<SnackPreference[]> {
  const result = await client
    .from("snack_preferences")
    .select("sentiment,snacks(id,name,brand,category,image_url)")
    .order("updated_at", { ascending: false });
  if (result.error) throw result.error;
  return (result.data || []).map((row) => mapSnackPreference(row as unknown as Record<string, unknown>));
}

export async function getSnackReleases(client: Pick<SupabaseClient, "from">, limit = 6): Promise<SnackRelease[]> {
  const result = await client
    .from("snack_releases")
    .select("id,title,brand,summary,article_url,published_at")
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (result.error) throw result.error;
  return (result.data || []).map((row) => mapSnackRelease(row));
}

async function currentUserId(client: Pick<SupabaseClient, "auth">): Promise<string> {
  const result = await client.auth.getUser();
  if (result.error || !result.data.user) throw result.error || new Error("Authentication required.");
  return result.data.user.id;
}

export async function createSnackLog(client: DataClient, snackId: string): Promise<void> {
  const userId = await currentUserId(client);
  const result = await client.from("snack_logs").insert({ user_id: userId, snack_id: snackId });
  if (result.error) throw result.error;
}

export async function updateSnackLog(client: Pick<SupabaseClient, "from">, logId: string, snackId: string): Promise<void> {
  const result = await client.from("snack_logs").update({ snack_id: snackId }).eq("id", logId);
  if (result.error) throw result.error;
}

export async function removeSnackLog(client: Pick<SupabaseClient, "from">, logId: string): Promise<void> {
  const result = await client.from("snack_logs").delete().eq("id", logId);
  if (result.error) throw result.error;
}

export async function setLogUpvote(client: DataClient, logId: string, upvoted: boolean): Promise<void> {
  if (upvoted) {
    const userId = await currentUserId(client);
    const result = await client.from("log_upvotes").insert({ log_id: logId, user_id: userId });
    if (result.error) throw result.error;
    return;
  }
  const result = await client.from("log_upvotes").delete().eq("log_id", logId);
  if (result.error) throw result.error;
}

export async function setSnackPreference(client: DataClient, snackId: string, sentiment: -1 | 1): Promise<void> {
  const userId = await currentUserId(client);
  const result = await client.from("snack_preferences").upsert(
    { user_id: userId, snack_id: snackId, sentiment },
    { onConflict: "user_id,snack_id" },
  );
  if (result.error) throw result.error;
}

export async function createManualSnack(
  client: DataClient,
  name: string,
  category: string,
): Promise<string> {
  const userId = await currentUserId(client);
  const cleanName = name.trim().replace(/\s+/g, " ").slice(0, 160);
  if (!cleanName) throw new Error("Snack name is required.");
  const result = await client.from("snacks").insert({
    name: cleanName,
    normalized_name: cleanName.toLowerCase(),
    category,
    source_type: "manual",
    created_by: userId,
  }).select("id").single();
  if (result.error) throw result.error;
  return result.data.id;
}
