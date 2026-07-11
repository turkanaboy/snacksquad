import { mapUsdaFoods, normalizeGtin, selectUsdaFoods, type UsdaFood } from "./product.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

function env(...names: string[]) {
  for (const name of names) {
    const value = Deno.env.get(name)?.trim();
    if (value) return value;
  }
}

async function authenticatedUserId(request: Request, supabaseUrl: string, publicKey: string) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: publicKey, Authorization: authorization },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) return null;
  const user = await response.json() as { id?: unknown };
  return typeof user.id === "string" ? user.id : null;
}

async function persistUsdaFood(
  food: UsdaFood,
  userId: string,
  supabaseUrl: string,
  serviceKey: string,
) {
  const product = mapUsdaFoods([food], "")[0];
  if (!product?.providerId) throw new Error("USDA product is missing its identifier.");
  const serviceHeaders: Record<string, string> = {
    apikey: serviceKey,
    "Content-Type": "application/json",
  };
  if (serviceKey.split(".").length === 3) serviceHeaders.Authorization = `Bearer ${serviceKey}`;
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/import_catalog_snack`, {
    method: "POST",
    headers: serviceHeaders,
    body: JSON.stringify({
      p_name: product.name,
      p_brand: product.brand ?? null,
      p_barcode: product.barcode ?? null,
      p_category: product.category ?? "Other",
      p_source_categories: product.sourceCategories ?? [],
      p_image_url: product.imageUrl ?? null,
      p_source_url: product.sourceUrl ?? null,
      p_nutrition_complete: product.nutritionComplete ?? false,
      p_created_by: userId,
    }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error("Catalog import failed.");
  const snackId = await response.json() as unknown;
  if (typeof snackId !== "string") throw new Error("Catalog import returned an invalid identifier.");
  return snackId;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const supabaseUrl = env("SUPABASE_URL");
  const publicKey = env("SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY");
  if (!supabaseUrl || !publicKey) return json({ error: "Authentication is not configured." }, 503);

  let userId: string | null;
  try {
    userId = await authenticatedUserId(request, supabaseUrl, publicKey);
  } catch {
    userId = null;
  }
  if (!userId) return json({ error: "Authentication required." }, 401);

  let body: { query?: unknown; importId?: unknown };
  try {
    const parsed = await request.json() as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json({ error: "Request body must be a JSON object." }, 400);
    }
    body = parsed as typeof body;
  } catch {
    return json({ error: "Request body must be JSON." }, 400);
  }

  const apiKey = env("USDA_API_KEY");
  if (!apiKey) return json({ error: "USDA FoodData Central is not configured." }, 503);

  const importId = typeof body.importId === "string" ? body.importId.trim() : "";
  if (importId) {
    if (!/^\d{1,12}$/.test(importId)) return json({ error: "Invalid USDA product identifier." }, 400);
    const serviceKey = env("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) return json({ error: "Catalog import is not configured." }, 503);
    try {
      const url = new URL(`https://api.nal.usda.gov/fdc/v1/food/${importId}`);
      url.searchParams.set("api_key", apiKey);
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8_000) });
      if (!response.ok) return json({ error: "USDA product is unavailable." }, 502);
      const food = await response.json() as UsdaFood;
      if (String(food.fdcId ?? "") !== importId) return json({ error: "USDA product is invalid." }, 502);
      return json({ snackId: await persistUsdaFood(food, userId, supabaseUrl, serviceKey) });
    } catch (error) {
      console.error("USDA catalog import failed", error);
      return json({ error: "Could not import that USDA product." }, 502);
    }
  }

  const cleanedQuery = typeof body.query === "string" ? body.query.trim() : "";
  if (!cleanedQuery || cleanedQuery.length > 100) {
    return json({ error: "Query must be between 1 and 100 characters." }, 400);
  }

  const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
  url.searchParams.set("api_key", apiKey);
  const isBarcode = /^\d{8,14}$/.test(cleanedQuery);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        query: cleanedQuery,
        dataType: isBarcode ? ["Branded"] : ["Foundation", "Branded"],
        pageSize: isBarcode ? 8 : 25,
      }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      console.warn(`USDA FoodData Central returned HTTP ${response.status}`);
      return json({ products: [], unavailable: true });
    }

    const data = await response.json() as { foods?: unknown };
    if (!Array.isArray(data.foods)) return json({ products: [], unavailable: true });
    let foods = data.foods.filter((food): food is UsdaFood => Boolean(food && typeof food === "object" && !Array.isArray(food)));
    if (isBarcode) {
      const normalizedQuery = normalizeGtin(cleanedQuery);
      foods = foods.filter((food) => normalizeGtin(food.gtinUpc) === normalizedQuery);
    } else {
      foods = selectUsdaFoods(foods, cleanedQuery);
    }
    return json({ products: mapUsdaFoods(foods, cleanedQuery) });
  } catch (error) {
    console.error("USDA FoodData Central request failed", error);
    return json({ products: [], unavailable: true });
  }
});
