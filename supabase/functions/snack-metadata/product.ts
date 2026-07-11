type UsdaFoodNutrient = {
  nutrientName?: unknown;
  value?: unknown;
};

export type UsdaFood = {
  fdcId?: unknown;
  dataType?: unknown;
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

function searchText(value: unknown) {
  return typeof value === "string"
    ? value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    : "";
}

function directlyMatchesFoundationName(food: UsdaFood, query: string) {
  if (food.dataType !== "Foundation" || query.includes(" ")) return false;
  const firstWord = searchText(food.description).split(" ")[0] ?? "";
  return firstWord === query || (firstWord.endsWith("s") && firstWord.slice(0, -1) === query);
}

function maturityIdentity(food: UsdaFood) {
  const description = searchText(food.description);
  if (food.dataType !== "Foundation" || !/\b(?:overripe|ripe)\b/.test(description)) return description;
  return description.replace(/\b(?:overripe|ripe|slightly|and|raw)\b/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeGtin(value: unknown) {
  const barcode = typeof value === "string" ? value.trim() : undefined;
  return barcode && /^\d{8,14}$/.test(barcode) ? barcode.padStart(14, "0") : undefined;
}

export function selectUsdaFoods(foods: UsdaFood[], query: string, limit = 8) {
  const normalizedQuery = searchText(query);
  const terms = normalizedQuery.split(" ").filter(Boolean);
  const candidates = foods
    .filter((food) => {
      const description = searchText(food.description);
      const searchable = `${description} ${searchText(food.brandName)} ${searchText(food.brandOwner)}`;
      return Boolean(description) && terms.every((term) => searchable.includes(term));
    });
  const directProduce = candidates.filter((food) =>
    directlyMatchesFoundationName(food, normalizedQuery) && /fruit|vegetable/i.test(String(food.foodCategory ?? ""))
  );
  const pool = directProduce.length ? directProduce : candidates;
  const ranked = pool
    .sort((left, right) => {
      const sourceRank = (food: UsdaFood) => food.dataType === "Foundation" ? 0 : 1;
      const maturityRank = (food: UsdaFood) => searchText(food.description).includes("overripe") ? 1 : 0;
      const matchRank = (food: UsdaFood) => {
        const description = searchText(food.description);
        return description === normalizedQuery ? 0 : description.startsWith(normalizedQuery) ? 1 : 2;
      };
      return sourceRank(left) - sourceRank(right) || maturityRank(left) - maturityRank(right) || matchRank(left) - matchRank(right);
    });

  const selected: UsdaFood[] = [];
  const seen = new Set<string>();
  for (const food of ranked) {
    const brand = text(food.brandName) ?? text(food.brandOwner);
    const key = `${maturityIdentity(food)}|${searchText(brand)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(food);
    if (selected.length === limit) break;
  }
  return selected;
}

function mapSnackCategory(category: string): SnackCategory {
  const value = category.toLowerCase();
  if (/fruits? and fruit juices?/.test(value)) return "Fruit";
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
    const hasProviderId = /^\d+$/.test(rawFdcId);
    const sourceUrl = hasProviderId
      ? `https://fdc.nal.usda.gov/fdc-app.html#/food-details/${rawFdcId}/nutrients`
      : undefined;

    return {
      ...(hasProviderId ? { providerId: rawFdcId } : {}),
      name: text(food.description) ?? text(fallbackName) ?? "Unknown snack",
      ...(brand ? { brand } : {}),
      ...(sourceCategory ? { category: mapSnackCategory(sourceCategory), sourceCategories: [sourceCategory] } : {}),
      ...(barcode ? { barcode } : {}),
      ...(sourceUrl ? { sourceUrl } : {}),
      nutritionComplete: nutritionIsComplete(food.foodNutrients),
    };
  });
}
