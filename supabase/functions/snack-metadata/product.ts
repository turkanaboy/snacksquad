export type OpenFoodFactsProduct = {
  code?: unknown;
  product_name?: unknown;
  generic_name?: unknown;
  brands?: unknown;
  categories?: unknown;
  image_url?: unknown;
  url?: unknown;
};

function text(value: unknown) {
  if (Array.isArray(value)) {
    const joined = value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).join(", ");
    return joined || undefined;
  }
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function mapOpenFoodFactsProducts(products: OpenFoodFactsProduct[], fallbackName: string) {
  return products.map((product) => {
    const brand = text(product.brands);
    const category = text(product.categories);
    const imageUrl = text(product.image_url);
    const barcode = text(product.code);
    const sourceUrl = text(product.url) ?? (barcode ? `https://world.openfoodfacts.org/product/${barcode}` : undefined);

    return {
      name: text(product.product_name) ?? text(product.generic_name) ?? fallbackName,
      ...(brand ? { brand } : {}),
      ...(category ? { category } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      ...(barcode ? { barcode } : {}),
      ...(sourceUrl ? { sourceUrl } : {}),
    };
  });
}
