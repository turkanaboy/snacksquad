import type { SupabaseClient, User } from "@supabase/supabase-js";

export type Snack = {
  id: string;
  name: string;
  normalized_name: string;
  category: string | null;
  note: string | null;
  image_url: string | null;
  created_by: string;
  display_name: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
  score?: number;
  comments?: SnackComment[];
  user_vote?: number;
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

export function findExactDuplicate<T extends { normalized_name: string }>(snacks: T[], name: string): T | null {
  const normalized = normalizeSnackName(name);
  return snacks.find((snack) => snack.normalized_name === normalized) ?? null;
}

export async function listSnacks(client: Db, user: User): Promise<Snack[]> {
  const [snacksResult, votesResult, commentsResult] = await Promise.all([
    client.from("snacks").select("*").eq("archived", false).order("created_at", { ascending: false }),
    client.from("snack_votes").select("*"),
    client.from("snack_comments").select("*").eq("deleted", false).order("created_at", { ascending: true }),
  ]);

  if (snacksResult.error) throw snacksResult.error;
  if (votesResult.error) throw votesResult.error;
  if (commentsResult.error) throw commentsResult.error;

  const votes = (votesResult.data ?? []) as Array<{ snack_id: string; user_id: string; value: number }>;
  const comments = (commentsResult.data ?? []) as SnackComment[];

  return ((snacksResult.data ?? []) as Snack[]).map((snack) => ({
    ...snack,
    score: votes.filter((vote) => vote.snack_id === snack.id).reduce((sum, vote) => sum + vote.value, 0),
    user_vote: votes.find((vote) => vote.snack_id === snack.id && vote.user_id === user.id)?.value ?? 0,
    comments: comments.filter((comment) => comment.snack_id === snack.id),
  }));
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
    image_url: cleanText(input.imageUrl),
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
      image_url: cleanText(input.imageUrl),
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
