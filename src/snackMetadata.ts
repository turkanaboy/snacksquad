export type SnackMetadata = {
  name: string;
  brand?: string;
  category?: string;
  imageUrl?: string;
  barcode?: string;
  sourceUrl?: string;
};

export async function searchSnackMetadata(query: string): Promise<SnackMetadata[]> {
  const q = query.trim();
  if (!q) return [];

  // ponytail: direct Open Food Facts search; replace with token/proxy only if their access rules require it.
  const url = new URL("https://world.openfoodfacts.org/cgi/search.pl");
  url.searchParams.set("search_terms", q);
  url.searchParams.set("search_simple", "1");
  url.searchParams.set("action", "process");
  url.searchParams.set("json", "1");
  url.searchParams.set("page_size", "3");

  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not search snack metadata yet.");
  const data = await response.json() as { products?: Array<Record<string, string>> };

  return (data.products ?? []).map((product) => ({
    name: product.product_name || product.generic_name || q,
    brand: product.brands,
    category: product.categories,
    imageUrl: product.image_url,
    barcode: product.code,
    sourceUrl: product.url,
  })).filter((product) => product.name);
}
