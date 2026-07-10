export type OpenFoodFactsProduct = {
  code?: unknown;
  product_name?: unknown;
  generic_name?: unknown;
  brands?: unknown;
  categories?: unknown;
  categories_tags?: unknown;
  image_url?: unknown;
  url?: unknown;
  nutrition_grades?: unknown;
  nutriments?: unknown;
};

export type SnackCategory =
  | "Grains/Bakery"
  | "Protein"
  | "Dairy"
  | "Fruit"
  | "Vegetables"
  | "Candy/Sweets"
  | "Chips/Savory Snacks"
  | "Beverages"
  | "Other";

function text(value: unknown, maxLength = 160) {
  if (Array.isArray(value)) {
    const joined = value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .join(", ");
    return joined ? joined.slice(0, maxLength) : undefined;
  }
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : undefined;
}

function textArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, 30);
}

function httpsUrl(value: unknown): string | undefined {
  const candidate = text(value, 500);
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function mapSnackCategory(categories: string[]): SnackCategory {
  const value = categories.join(" ").toLowerCase();
  if (/beverage|drink|soda|water|juice|coffee|tea/.test(value)) return "Beverages";
  if (/potato-chips|corn-chips|tortilla-chips|crisps|salty-snack|savory-snack/.test(value)) return "Chips/Savory Snacks";
  if (/candy|candies|confection|chocolate|sweet|gum|caramel/.test(value)) return "Candy/Sweets";
  if (/fruit|apple|banana|berry|berries|orange|grape|melon/.test(value)) return "Fruit";
  if (/vegetable|carrot|celery|broccoli|cucumber|tomato/.test(value)) return "Vegetables";
  if (/milk|cheese|yogurt|dairy|cream/.test(value)) return "Dairy";
  if (/meat|fish|egg|nut|seed|legume|bean|protein/.test(value)) return "Protein";
  if (/bread|bakery|cracker|cereal|grain|pretzel|cookie|biscuit/.test(value)) return "Grains/Bakery";
  return "Other";
}

function nutritionIsComplete(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const nutriments = value as Record<string, unknown>;
  const required = ["fat_100g", "saturated-fat_100g", "carbohydrates_100g", "sugars_100g", "proteins_100g", "salt_100g"];
  const hasEnergy = Number.isFinite(nutriments["energy-kcal_100g"]) || Number.isFinite(nutriments.energy_100g);
  return hasEnergy && required.every((key) => Number.isFinite(nutriments[key]));
}

export function mapOpenFoodFactsProducts(products: OpenFoodFactsProduct[], fallbackName: string) {
  return products.map((product) => {
    const brand = text(product.brands);
    const sourceCategories = textArray(product.categories_tags);
    if (sourceCategories.length === 0) {
      const categoryText = text(product.categories, 1000);
      if (categoryText) sourceCategories.push(...categoryText.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 30));
    }
    const imageUrl = httpsUrl(product.image_url);
    const rawBarcode = text(product.code, 14);
    const barcode = rawBarcode && /^\d{8,14}$/.test(rawBarcode) ? rawBarcode : undefined;
    const sourceUrl = httpsUrl(product.url) ?? (barcode ? `https://world.openfoodfacts.org/product/${barcode}` : undefined);
    const rawNutriScore = text(product.nutrition_grades, 1)?.toLowerCase();
    const nutriScore = rawNutriScore && /^[a-e]$/.test(rawNutriScore) ? rawNutriScore : undefined;

    return {
      name: text(product.product_name) ?? text(product.generic_name) ?? text(fallbackName) ?? "Unknown snack",
      ...(brand ? { brand } : {}),
      ...(sourceCategories.length ? { category: mapSnackCategory(sourceCategories), sourceCategories } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      ...(barcode ? { barcode } : {}),
      ...(sourceUrl ? { sourceUrl } : {}),
      ...(nutriScore ? { nutriScore, nutritionComplete: nutritionIsComplete(product.nutriments) } : {}),
    };
  });
}
