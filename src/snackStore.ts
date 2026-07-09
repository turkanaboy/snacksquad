import type { SupabaseClient, User } from "@supabase/supabase-js";

export type Snack = {
  id: string;
  name: string;
  normalized_name: string;
  category: string | null;
  note: string | null;
  source_note: string | null;
  image_url: string | null;
  created_by: string;
  display_name: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
  score?: number;
  comments?: SnackComment[];
  user_vote?: number;
  personal_rating?: number;
};

export type BracketVote = {
  week_key: string;
  match_key: string;
  snack_id: string;
  user_id: string;
};

export type SnackComment = {
  id: string;
  snack_id: string;
  body: string;
  created_by: string;
  display_name: string;
  deleted: boolean;
  created_at: string;
  updated_at: string;
};

export type SnackInput = {
  name: string;
  category?: string;
  note?: string;
  sourceNote?: string;
  imageUrl?: string;
};

type Db = Pick<SupabaseClient, "from">;

export function normalizeSnackName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function cleanText(value?: string): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

export function cleanImageUrl(value?: string): string | null {
  const cleaned = cleanText(value);
  if (!cleaned) return null;
  const url = new URL(cleaned);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Image URL must start with http:// or https://.");
  return url.toString();
}

export function findExactDuplicate<T extends { normalized_name: string }>(snacks: T[], name: string): T | null {
  const normalized = normalizeSnackName(name);
  return snacks.find((snack) => snack.normalized_name === normalized) ?? null;
}

export function findSimilarDuplicates<T extends { normalized_name: string }>(snacks: T[], name: string): T[] {
  const words = normalizeSnackName(name).split(" ").filter((word) => word.length > 2);
  if (words.length === 0) return [];
  return snacks.filter((snack) => words.some((word) => snack.normalized_name.includes(word))).slice(0, 3);
}

export function pickSnackOfTheDay<T>(snacks: T[], today = new Date()): T | null {
  if (snacks.length === 0) return null;
  const key = today.toISOString().slice(0, 10);
  const index = Array.from(key).reduce((sum, char) => sum + char.charCodeAt(0), 0) % snacks.length;
  return snacks[index];
}

export function snacksToCsv(snacks: Snack[]): string {
  const rows = [
    ["Name", "Category", "Score", "Suggested by", "Pitch", "Image URL"],
    ...snacks.map((snack) => [
      snack.name,
      snack.category ?? "",
      String(snack.score ?? 0),
      snack.display_name,
      snack.note ?? "",
      snack.image_url ?? "",
    ]),
  ];
  return rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
}

export type SnackBadge = {
  label: string;
  snack: Snack;
};

export type BracketMatch = {
  left: Snack;
  right: Snack | null;
};

export function getSnackBadges(snacks: Snack[]): SnackBadge[] {
  const active = snacks.filter((snack) => !snack.archived);
  if (active.length === 0) return [];

  const badges: SnackBadge[] = [];
  const topVoted = [...active].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  const mostDiscussed = [...active].sort((a, b) => (b.comments?.length ?? 0) - (a.comments?.length ?? 0))[0];
  const personalFavorite = [...active].filter((snack) => snack.personal_rating).sort((a, b) => (b.personal_rating ?? 0) - (a.personal_rating ?? 0))[0];

  if ((topVoted.score ?? 0) > 0) badges.push({ label: "Crowd favorite", snack: topVoted });
  if ((mostDiscussed.comments?.length ?? 0) > 0) badges.push({ label: "Most debated", snack: mostDiscussed });
  if (personalFavorite) badges.push({ label: "My favorite", snack: personalFavorite });

  return badges;
}

export function getWeekKey(today = new Date()): string {
  const firstDay = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  const day = Math.floor((today.getTime() - firstDay.getTime()) / 86400000);
  return `${today.getUTCFullYear()}-W${String(Math.floor(day / 7) + 1).padStart(2, "0")}`;
}

export function getWeeklyBracket(snacks: Snack[]): BracketMatch[] {
  const nominated = snacks
    .filter((snack) => !snack.archived)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.name.localeCompare(b.name))
    .slice(0, 8);

  const matches: BracketMatch[] = [];
  for (let index = 0; index < nominated.length; index += 2) {
    matches.push({ left: nominated[index], right: nominated[index + 1] ?? null });
  }
  return matches;
}

export async function listSnacks(client: Db, user: User, includeArchived = false): Promise<{ snacks: Snack[]; bracketVotes: BracketVote[] }> {
  let snacksQuery = client.from("snacks").select("*").order("created_at", { ascending: false });
  if (!includeArchived) snacksQuery = snacksQuery.eq("archived", false);

  const [snacksResult, votesResult, commentsResult, ratingsResult, bracketVotesResult] = await Promise.all([
    snacksQuery,
    client.from("snack_votes").select("*"),
    client.from("snack_comments").select("*").eq("deleted", false).order("created_at", { ascending: true }),
    client.from("snack_ratings").select("snack_id,rating").eq("user_id", user.id),
    client.from("bracket_votes").select("week_key,match_key,snack_id,user_id").eq("week_key", getWeekKey()),
  ]);

  if (snacksResult.error) throw snacksResult.error;
  if (votesResult.error) throw votesResult.error;
  if (commentsResult.error) throw commentsResult.error;
  if (ratingsResult.error) throw ratingsResult.error;
  if (bracketVotesResult.error) throw bracketVotesResult.error;

  const votes = (votesResult.data ?? []) as Array<{ snack_id: string; user_id: string; value: number }>;
  const comments = (commentsResult.data ?? []) as SnackComment[];
  const ratings = (ratingsResult.data ?? []) as Array<{ snack_id: string; rating: number }>;

  return {
    snacks: ((snacksResult.data ?? []) as Snack[]).map((snack) => ({
      ...snack,
      score: votes.filter((vote) => vote.snack_id === snack.id).reduce((sum, vote) => sum + vote.value, 0),
      user_vote: votes.find((vote) => vote.snack_id === snack.id && vote.user_id === user.id)?.value ?? 0,
      personal_rating: ratings.find((rating) => rating.snack_id === snack.id)?.rating,
      comments: comments.filter((comment) => comment.snack_id === snack.id),
    })),
    bracketVotes: (bracketVotesResult.data ?? []) as BracketVote[],
  };
}

export async function createSnack(
  client: Db,
  user: User,
  displayName: string,
  input: SnackInput,
): Promise<Snack> {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Snack name is required.");

  const payload = {
    name,
    normalized_name: normalizeSnackName(name),
    category: cleanText(input.category),
    note: cleanText(input.note),
    source_note: cleanText(input.sourceNote),
    image_url: cleanImageUrl(input.imageUrl),
    created_by: user.id,
    display_name: displayName,
  };

  const result = await client.from("snacks").insert(payload).select("*").single();
  if (result.error) throw result.error;
  return result.data as Snack;
}

export async function updateSnack(
  client: Db,
  id: string,
  input: SnackInput,
): Promise<Snack> {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Snack name is required.");

  const result = await client
    .from("snacks")
    .update({
      name,
      normalized_name: normalizeSnackName(name),
      category: cleanText(input.category),
      note: cleanText(input.note),
      source_note: cleanText(input.sourceNote),
      image_url: cleanImageUrl(input.imageUrl),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (result.error) throw result.error;
  return result.data as Snack;
}

export async function archiveSnack(client: Db, id: string) {
  const result = await client
    .from("snacks")
    .update({ archived: true, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (result.error) throw result.error;
}

export async function setVote(client: Db, snackId: string, user: User, value: number) {
  const result = await client
    .from("snack_votes")
    .upsert(
      { snack_id: snackId, user_id: user.id, value, updated_at: new Date().toISOString() },
      { onConflict: "snack_id,user_id" },
    );
  if (result.error) throw result.error;
}

export async function setRating(client: Db, snackId: string, user: User, rating: number) {
  const result = await client
    .from("snack_ratings")
    .upsert(
      { snack_id: snackId, user_id: user.id, rating, updated_at: new Date().toISOString() },
      { onConflict: "snack_id,user_id" },
    );
  if (result.error) throw result.error;
}

export async function setBracketVote(client: Db, weekKey: string, matchKey: string, snackId: string, user: User) {
  const result = await client
    .from("bracket_votes")
    .upsert(
      { week_key: weekKey, match_key: matchKey, snack_id: snackId, user_id: user.id, updated_at: new Date().toISOString() },
      { onConflict: "week_key,match_key,user_id" },
    );
  if (result.error) throw result.error;
}

export async function addComment(
  client: Db,
  snackId: string,
  user: User,
  displayName: string,
  body: string,
): Promise<SnackComment> {
  const cleaned = body.trim();
  if (!cleaned) throw new Error("Comment is required.");

  const result = await client
    .from("snack_comments")
    .insert({ snack_id: snackId, user_id: user.id, display_name: displayName, body: cleaned })
    .select("*")
    .single();
  if (result.error) throw result.error;
  return result.data as SnackComment;
}

export async function deleteComment(client: Db, id: string) {
  const result = await client
    .from("snack_comments")
    .update({ deleted: true, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (result.error) throw result.error;
}
