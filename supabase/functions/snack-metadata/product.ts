type UsdaFoodNutrient = {
  nutrientName?: unknown;
  value?: unknown;
};

export type UsdaFood = {
  fdcId?: unknown;
  description?: unknown;
  brandName?: unknown;
  brandOwner?: unknown;
  gtinUpc?: unknown;
  foodCategory?: unknown;
  foodNutrients?: unknown;
};

type SnackCategory =
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
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : undefined;
}

export function normalizeGtin(value: unknown) {
  const barcode = typeof value === "string" ? value.trim() : undefined;
  return barcode && /^\d{8,14}$/.test(barcode) ? barcode.padStart(14, "0") : undefined;
}

function mapSnackCategory(category: string): SnackCategory {
  const value = category.toLowerCase();
  if (/beverage|drink|soda|water|juice|coffee|tea/.test(value)) return "Beverages";
  if (/\bchips?\b|crisps|salty-snack|savory-snack|pretzel.*snack/.test(value)) return "Chips/Savory Snacks";
  if (/candy|candies|confection|chocolate|sweet|gum|caramel/.test(value)) return "Candy/Sweets";
  if (/fruit|apple|banana|berry|berries|orange|grape|melon/.test(value)) return "Fruit";
  if (/vegetable|carrot|celery|broccoli|cucumber|tomato/.test(value)) return "Vegetables";
  if (/milk|cheese|yogurt|dairy|cream/.test(value)) return "Dairy";
  if (/meat|fish|egg|nut|seed|legume|bean|protein/.test(value)) return "Protein";
  if (/bread|bakery|cracker|cereal|grain|pretzel|cookie|biscuit/.test(value)) return "Grains/Bakery";
  return "Other";
}

function nutritionIsComplete(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  const names = value
    .filter((item): item is UsdaFoodNutrient => Boolean(item && typeof item === "object" && Number.isFinite((item as UsdaFoodNutrient).value)))
    .map((item) => text(item.nutrientName)?.toLowerCase())
    .filter((name): name is string => Boolean(name));
  const has = (pattern: RegExp) => names.some((name) => pattern.test(name));
  return has(/^energy/) && has(/total lipid|total fat/) && has(/saturated/) &&
    has(/carbohydrate/) && has(/sugars?/) && has(/^protein/) && has(/^sodium/);
}

export function mapUsdaFoods(foods: UsdaFood[], fallbackName: string) {
  return foods.map((food) => {
    const brand = text(food.brandName) ?? text(food.brandOwner);
    const sourceCategory = text(food.foodCategory, 120);
    const barcode = normalizeGtin(food.gtinUpc);
    const rawFdcId = typeof food.fdcId === "number" || typeof food.fdcId === "string" ? String(food.fdcId) : "";
    const sourceUrl = /^\d+$/.test(rawFdcId)
      ? `https://fdc.nal.usda.gov/fdc-app.html#/food-details/${rawFdcId}/nutrients`
      : undefined;

    return {
      name: text(food.description) ?? text(fallbackName) ?? "Unknown snack",
      ...(brand ? { brand } : {}),
      ...(sourceCategory ? { category: mapSnackCategory(sourceCategory), sourceCategories: [sourceCategory] } : {}),
      ...(barcode ? { barcode } : {}),
      ...(sourceUrl ? { sourceUrl } : {}),
      nutritionComplete: nutritionIsComplete(food.foodNutrients),
    };
  });
}
