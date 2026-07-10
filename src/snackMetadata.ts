export type SnackMetadata = {
  name: string;
  brand?: string;
  category?: string;
  imageUrl?: string;
  barcode?: string;
  sourceUrl?: string;
};

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
