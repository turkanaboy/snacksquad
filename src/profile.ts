import type { Session, SupabaseClient } from "@supabase/supabase-js";

const fallbackName = "Snack Fan";
const companyEmailPattern = /^[^@\s]+@carnegiehighered\.com$/i;

export type Profile = {
  userId: string;
  displayName: string;
  favoriteSnackId: string | null;
};

export type PublicProfile = {
  userId: string;
  displayName: string;
  favoriteSnackId: string | null;
  favoriteSnackName: string | null;
  totalLogs: number;
  distinctSnacks: number;
  categoryMix: Record<string, number>;
  badges: Array<{ key: string; label: string; startDate: string; endDate: string | null }>;
};

export function normalizeDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 80).trim() || fallbackName;
}

export function isCompanyEmail(value: string): boolean {
  return companyEmailPattern.test(value.trim());
}

export function deriveDisplayName(email?: string | null): string {
  if (!email) return fallbackName;
  return normalizeDisplayName(email.split("@", 1)[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()));
}

export async function requestMagicLink(
  client: Pick<SupabaseClient, "auth">,
  value: string,
  emailRedirectTo?: string,
): Promise<void> {
  const email = value.trim().toLowerCase();
  if (!isCompanyEmail(email)) throw new Error("Use your @carnegiehighered.com email address.");
  const result = await client.auth.signInWithOtp({
    email,
    options: emailRedirectTo ? { emailRedirectTo } : undefined,
  });
  if (result.error) throw result.error;
}

export async function loadSession(client: Pick<SupabaseClient, "auth">): Promise<Session | null> {
  const result = await client.auth.getSession();
  if (result.error) throw result.error;
  return result.data.session;
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

async function authenticatedUserId(client: Pick<SupabaseClient, "auth">): Promise<string> {
  const result = await client.auth.getUser();
  if (result.error || !result.data.user) throw result.error || new Error("Authentication required.");
  return result.data.user.id;
}

function mapProfile(row: { user_id: string; display_name: string; favorite_snack_id: string | null }): Profile {
  return { userId: row.user_id, displayName: row.display_name, favoriteSnackId: row.favorite_snack_id };
}

export async function loadMyProfile(client: Pick<SupabaseClient, "auth" | "from">): Promise<Profile> {
  const userId = await authenticatedUserId(client);
  const result = await client.from("profiles").select("user_id,display_name,favorite_snack_id").eq("user_id", userId).single();
  if (result.error) throw result.error;
  return mapProfile(result.data);
}

export async function updateMyProfile(
  client: Pick<SupabaseClient, "auth" | "from">,
  changes: { displayName?: string; favoriteSnackId?: string | null },
): Promise<Profile> {
  const userId = await authenticatedUserId(client);
  const payload = {
    ...(changes.displayName === undefined ? {} : { display_name: normalizeDisplayName(changes.displayName) }),
    ...(changes.favoriteSnackId === undefined ? {} : { favorite_snack_id: changes.favoriteSnackId }),
  };
  const result = await client.from("profiles").update(payload).eq("user_id", userId).select("user_id,display_name,favorite_snack_id").single();
  if (result.error) throw result.error;
  return mapProfile(result.data);
}

export async function loadPublicProfile(client: Pick<SupabaseClient, "rpc">, userId: string): Promise<PublicProfile> {
  const [summaryResult, badgeResult] = await Promise.all([
    client.rpc("profile_summary", { p_user_id: userId }),
    client.rpc("profile_badges", { p_user_id: userId }),
  ]);
  if (summaryResult.error) throw summaryResult.error;
  if (badgeResult.error) throw badgeResult.error;
  const summary = summaryResult.data?.[0];
  if (!summary) throw new Error("Profile not found.");
  return {
    userId: summary.user_id,
    displayName: summary.display_name,
    favoriteSnackId: summary.favorite_snack_id,
    favoriteSnackName: summary.favorite_snack_name,
    totalLogs: Number(summary.total_logs),
    distinctSnacks: Number(summary.distinct_snacks),
    categoryMix: summary.category_mix || {},
    badges: (badgeResult.data || []).map((badge: {
      badge_key: string;
      label: string;
      start_date: string;
      end_date: string | null;
    }) => ({
      key: badge.badge_key,
      label: badge.label,
      startDate: badge.start_date,
      endDate: badge.end_date,
    })),
  };
}
