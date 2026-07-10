import type { Session, SupabaseClient, User } from "@supabase/supabase-js";

const displayNameKey = "snack-squad-display-name";
const fallbackName = "Snack Fan";

export type Profile = {
  user: User;
  displayName: string;
};

const companyEmailPattern = /^[^@\s]+@carnegiehighered\.com$/i;

type MagicLinkClient = {
  auth: {
    signInWithOtp(input: {
      email: string;
      options?: { emailRedirectTo?: string };
    }): Promise<{ error: { message: string } | null }>;
  };
};

export function normalizeDisplayName(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ").slice(0, 80).trim();
  return trimmed || fallbackName;
}

export function isCompanyEmail(value: string): boolean {
  return companyEmailPattern.test(value.trim());
}

export function deriveDisplayName(email?: string | null): string {
  if (!email) return fallbackName;
  const localPart = email.trim().split("@", 1)[0] || "";
  const words = localPart
    .replace(/[._-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  return normalizeDisplayName(words.join(" "));
}

export async function requestMagicLink(
  client: MagicLinkClient,
  value: string,
  emailRedirectTo?: string,
): Promise<void> {
  const email = value.trim().toLowerCase();
  if (!isCompanyEmail(email)) {
    throw new Error("Use your @carnegiehighered.com email address.");
  }

  const result = await client.auth.signInWithOtp({
    email,
    options: emailRedirectTo ? { emailRedirectTo } : undefined,
  });
  if (result.error) throw new Error(result.error.message);
}

export function observeSession(
  client: Pick<SupabaseClient, "auth">,
  listener: (session: Session | null) => void,
): () => void {
  const { data } = client.auth.onAuthStateChange((_event, session) => listener(session));
  return () => data.subscription.unsubscribe();
}

export async function signOut(client: Pick<SupabaseClient, "auth">): Promise<void> {
  const result = await client.auth.signOut();
  if (result.error) throw result.error;
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
