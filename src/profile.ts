import type { SupabaseClient, User } from "@supabase/supabase-js";

const displayNameKey = "snack-squad-display-name";
const fallbackName = "Snack Fan";

export type Profile = {
  user: User;
  displayName: string;
};

export function normalizeDisplayName(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed || fallbackName;
}

export function getStoredDisplayName(storage: Storage = localStorage): string {
  return normalizeDisplayName(storage.getItem(displayNameKey) || fallbackName);
}

export function saveDisplayName(value: string, storage: Storage = localStorage): string {
  const displayName = normalizeDisplayName(value);
  storage.setItem(displayNameKey, displayName);
  return displayName;
}

export async function ensureAnonymousProfile(
  client: Pick<SupabaseClient, "auth" | "from">,
  storage: Storage = localStorage,
): Promise<Profile> {
  const existing = await client.auth.getUser();
  if (existing.data.user) {
    const displayName = getStoredDisplayName(storage);
    await saveProfile(client, existing.data.user, displayName);
    return { user: existing.data.user, displayName };
  }

  const created = await client.auth.signInAnonymously();
  if (created.error || !created.data.user) {
    throw new Error(created.error?.message || "Could not start anonymous Snack Squad session.");
  }

  const displayName = getStoredDisplayName(storage);
  await saveProfile(client, created.data.user, displayName);
  return { user: created.data.user, displayName };
}

export async function saveProfile(
  client: Pick<SupabaseClient, "from">,
  user: User,
  displayName: string,
) {
  const result = await client
    .from("profiles")
    .upsert(
      { user_id: user.id, display_name: normalizeDisplayName(displayName), updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (result.error) throw result.error;
}
