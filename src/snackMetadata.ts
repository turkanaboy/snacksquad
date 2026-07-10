import type { SupabaseClient } from "@supabase/supabase-js";

export type SnackMetadata = {
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

export type SnackSearchSource = {
  local(query: string): Promise<SnackMetadata[]>;
  remote(query: string): Promise<SnackMetadata[]>;
};

const snackCategories = new Set([
  "Grains/Bakery", "Protein", "Dairy", "Fruit", "Vegetables", "Candy/Sweets",
  "Chips/Savory Snacks", "Beverages", "Other",
]);

type MetadataClient = {
  functions: {
    invoke(
      name: string,
      options: { body: { query: string } },
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

  const products = (data as { products?: unknown } | null)?.products;
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
  delayMs = 400,
  onError: (query: string, error: unknown) => void = () => {},
) {
  let version = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function search(value: string): Promise<void> {
    const query = value.trim();
    const currentVersion = ++version;
    if (timer) clearTimeout(timer);

    if (!query) {
      onResults(query, []);
      return;
    }

    const local = await source.local(query);
    if (currentVersion !== version) return;
    onResults(query, local);

    const isBarcode = /^\d{8,14}$/.test(query);
    if (!isBarcode && query.length < 3) return;

    const addRemote = async () => {
      try {
        const remote = await source.remote(query);
        if (currentVersion === version) onResults(query, mergeSnackMetadata(local, remote));
      } catch (error) {
        if (currentVersion === version) onError(query, error);
      }
    };

    if (isBarcode) await addRemote();
    else timer = setTimeout(() => void addRemote(), delayMs);
  }

  return {
    search,
    dispose() {
      version += 1;
      if (timer) clearTimeout(timer);
    },
  };
}

export function toCatalogSnackParams(product: SnackMetadata) {
  return {
    p_name: product.name.trim().replace(/\s+/g, " ").slice(0, 160),
    p_brand: product.brand?.trim().slice(0, 160) || null,
    p_barcode: product.barcode || null,
    p_category: snackCategories.has(product.category || "") ? product.category : "Other",
    p_source_categories: product.sourceCategories?.slice(0, 30) || [],
    p_image_url: product.imageUrl || null,
    p_source_url: product.sourceUrl || null,
    p_nutri_score: product.nutriScore || null,
    p_nutrition_complete: product.nutritionComplete || false,
  };
}

export async function saveSelectedSnack(
  client: Pick<SupabaseClient, "rpc">,
  product: SnackMetadata,
): Promise<string> {
  const result = await client.rpc("upsert_catalog_snack", toCatalogSnackParams(product));
  if (result.error) throw result.error;
  if (typeof result.data !== "string") throw new Error("Could not save the selected snack.");
  return result.data;
}

export async function searchLocalSnacks(
  client: Pick<SupabaseClient, "from">,
  query: string,
): Promise<SnackMetadata[]> {
  const normalized = query.trim().replace(/\s+/g, " ").toLowerCase();
  if (!normalized) return [];
  const result = await client
    .from("snacks")
    .select("name,brand,barcode,category,source_categories,image_url,source_url,nutri_score,nutrition_complete")
    .ilike("normalized_name", `%${normalized}%`)
    .is("merged_into_id", null)
    .limit(8);
  if (result.error) throw result.error;
  return (result.data || []).map((row) => ({
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
  delayMs = 400,
  onError?: (query: string, error: unknown) => void,
) {
  return createSnackSearch({
    local: (query) => searchLocalSnacks(client, query),
    remote: (query) => searchSnackMetadata(client, query),
  }, onResults, delayMs, onError);
}
