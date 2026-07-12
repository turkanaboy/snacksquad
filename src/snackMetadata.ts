import type { SupabaseClient } from "@supabase/supabase-js";

export type SnackMetadata = {
  id?: string;
  providerId?: string;
  name: string;
  brand?: string;
  category?: string;
  sourceCategories?: string[];
  imageUrl?: string;
  barcode?: string;
  sourceUrl?: string;
  nutriScore?: string;
  nutritionComplete?: boolean;
};

export type SnackCorrection = {
  id: string;
  snackId: string;
  snackName: string;
  currentValues: Record<string, unknown>;
  proposedChanges: Record<string, unknown>;
  reason: string;
  status: string;
  createdAt: string;
};

export type SnackSearchSource = {
  local(query: string): Promise<SnackMetadata[]>;
  remote(query: string): Promise<SnackMetadata[]>;
};

type MetadataClient = {
  functions: {
    invoke(
      name: string,
      options: { body: { query: string } | { importId: string } },
    ): Promise<{ data: unknown; error: { message?: string } | null }>;
  };
};

function isSnackMetadata(value: unknown): value is SnackMetadata {
  return Boolean(value && typeof value === "object" && typeof (value as SnackMetadata).name === "string");
}

export async function searchSnackMetadata(client: MetadataClient, query: string): Promise<SnackMetadata[]> {
  const q = query.trim();
  if (!q) return [];

  const { data, error } = await client.functions.invoke("snack-metadata", { body: { query: q } });
  if (error) throw new Error("Could not search snack metadata yet.");

  const response = data as { products?: unknown; unavailable?: unknown } | null;
  if (response?.unavailable === true) {
    throw new Error("Live snack search is temporarily unavailable.");
  }

  const products = response?.products;
  if (!Array.isArray(products)) throw new Error("Could not search snack metadata yet.");
  return products.filter(isSnackMetadata);
}

function metadataKey(product: SnackMetadata): string {
  return product.barcode || product.name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function mergeSnackMetadata(local: SnackMetadata[], remote: SnackMetadata[]): SnackMetadata[] {
  const merged = [...local];
  const known = new Set(local.map(metadataKey));
  for (const product of remote) {
    const key = metadataKey(product);
    if (!known.has(key)) {
      known.add(key);
      merged.push(product);
    }
  }
  return merged;
}

export function createSnackSearch(
  source: SnackSearchSource,
  onResults: (query: string, products: SnackMetadata[]) => void,
  onError: (query: string, error: unknown) => void = () => {},
  outageCooldownMs = 60_000,
) {
  let version = 0;
  let nameSearchRetryAt = 0;
  let lastNameSearchError: unknown;

  async function run(value: string, includeRemote: boolean): Promise<void> {
    const query = value.trim();
    const currentVersion = ++version;

    if (!query) {
      onResults(query, []);
      return;
    }

    let local: SnackMetadata[];
    try {
      local = await source.local(query);
    } catch (error) {
      if (currentVersion === version) onError(query, error);
      return;
    }
    if (currentVersion !== version) return;
    onResults(query, local);
    if (!includeRemote) return;

    const isBarcode = /^\d{8,14}$/.test(query);
    if (!isBarcode && query.length < 3) return;

    if (!isBarcode && Date.now() < nameSearchRetryAt) {
      onError(query, lastNameSearchError);
      return;
    }

    try {
      const remote = await source.remote(query);
      if (!isBarcode) {
        nameSearchRetryAt = 0;
        lastNameSearchError = undefined;
      }
      if (currentVersion === version) onResults(query, mergeSnackMetadata(local, remote));
    } catch (error) {
      if (!isBarcode) {
        nameSearchRetryAt = Date.now() + outageCooldownMs;
        lastNameSearchError = error;
      }
      if (currentVersion === version) onError(query, error);
    }
  }

  return {
    search: (value: string) => run(value, false),
    searchRemote: (value: string) => run(value, true),
    dispose() {
      version += 1;
    },
  };
}

export async function saveSelectedSnack(
  client: Pick<SupabaseClient, "functions">,
  product: SnackMetadata,
): Promise<string> {
  if (!product.providerId) throw new Error("Choose a verified catalog result or add the snack manually.");
  const result = await client.functions.invoke("snack-metadata", { body: { importId: product.providerId } });
  if (result.error) throw new Error("Could not save the selected snack.");
  const snackId = (result.data as { snackId?: unknown } | null)?.snackId;
  if (typeof snackId !== "string") throw new Error("Could not save the selected snack.");
  return snackId;
}

export async function searchLocalSnacks(
  client: Pick<SupabaseClient, "from">,
  query: string,
): Promise<SnackMetadata[]> {
  const normalized = query.trim().replace(/\s+/g, " ").toLowerCase();
  if (!normalized) return [];
  const result = await client
    .from("snacks")
    .select("id,name,brand,barcode,category,source_categories,image_url,source_url,nutri_score,nutrition_complete")
    .ilike("normalized_name", `%${normalized}%`)
    .is("merged_into_id", null)
    .limit(8);
  if (result.error) throw result.error;
  return (result.data || []).map((row) => ({
    id: row.id,
    name: row.name,
    ...(row.brand ? { brand: row.brand } : {}),
    ...(row.barcode ? { barcode: row.barcode } : {}),
    category: row.category,
    sourceCategories: row.source_categories,
    ...(row.image_url ? { imageUrl: row.image_url } : {}),
    ...(row.source_url ? { sourceUrl: row.source_url } : {}),
    ...(row.nutri_score ? { nutriScore: row.nutri_score } : {}),
    nutritionComplete: row.nutrition_complete,
  }));
}

export function createSupabaseSnackSearch(
  client: Pick<SupabaseClient, "from" | "functions">,
  onResults: (query: string, products: SnackMetadata[]) => void,
  onError?: (query: string, error: unknown) => void,
) {
  return createSnackSearch({
    local: (query) => searchLocalSnacks(client, query),
    remote: (query) => searchSnackMetadata(client, query),
  }, onResults, onError);
}

export async function submitSnackCorrection(
  client: Pick<SupabaseClient, "auth" | "from">,
  snackId: string,
  proposedChanges: Record<string, unknown>,
  reason: string,
): Promise<void> {
  const userResult = await client.auth.getUser();
  if (userResult.error || !userResult.data.user) throw userResult.error || new Error("Authentication required.");
  const result = await client.from("snack_corrections").insert({
    snack_id: snackId,
    suggested_by: userResult.data.user.id,
    proposed_changes: proposedChanges,
    reason: reason.trim(),
  });
  if (result.error) throw result.error;
}

export async function listSnackCorrections(client: Pick<SupabaseClient, "from">): Promise<SnackCorrection[]> {
  const result = await client.from("snack_corrections")
    .select("id,snack_id,proposed_changes,reason,status,created_at,snacks(name,brand,barcode,category,image_url,source_url,nutri_score,nutrition_complete,nutrition_verified)")
    .order("created_at", { ascending: false });
  if (result.error) throw result.error;
  return (result.data || []).map((row) => {
    const snack = (row.snacks || {}) as unknown as Record<string, unknown>;
    return {
      id: row.id,
      snackId: row.snack_id,
      snackName: String(snack.name || "Snack"),
      currentValues: snack,
      proposedChanges: row.proposed_changes,
      reason: row.reason,
      status: row.status,
      createdAt: row.created_at,
    };
  });
}

export async function reviewSnackCorrection(
  client: Pick<SupabaseClient, "rpc">,
  correctionId: string,
  approve: boolean,
): Promise<void> {
  const result = await client.rpc("review_snack_correction", {
    p_correction_id: correctionId,
    p_approve: approve,
  });
  if (result.error) throw result.error;
}

export async function isModerator(client: Pick<SupabaseClient, "rpc">): Promise<boolean> {
  const result = await client.rpc("is_moderator");
  if (result.error) throw result.error;
  return Boolean(result.data);
}
