import { mapUsdaFoods, normalizeGtin, type UsdaFood } from "./product.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (!request.headers.get("Authorization")?.startsWith("Bearer ")) {
    return json({ error: "Authentication required." }, 401);
  }

  let query: unknown;
  try {
    query = (await request.json() as { query?: unknown }).query;
  } catch {
    return json({ error: "Request body must be JSON." }, 400);
  }

  const cleanedQuery = typeof query === "string" ? query.trim() : "";
  if (!cleanedQuery || cleanedQuery.length > 100) {
    return json({ error: "Query must be between 1 and 100 characters." }, 400);
  }

  const apiKey = Deno.env.get("USDA_API_KEY")?.trim();
  if (!apiKey) return json({ error: "USDA FoodData Central is not configured." }, 503);

  const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
  url.searchParams.set("api_key", apiKey);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ query: cleanedQuery, dataType: ["Branded"], pageSize: 8 }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      console.warn(`USDA FoodData Central returned HTTP ${response.status}`);
      return json({ products: [], unavailable: true });
    }

    const data = await response.json() as { foods?: unknown };
    if (!Array.isArray(data.foods)) return json({ products: [], unavailable: true });
    let foods = data.foods.filter((food): food is UsdaFood => Boolean(food && typeof food === "object" && !Array.isArray(food)));
    if (/^\d{8,14}$/.test(cleanedQuery)) {
      const normalizedQuery = normalizeGtin(cleanedQuery);
      foods = foods.filter((food) => normalizeGtin(food.gtinUpc) === normalizedQuery);
    }
    return json({ products: mapUsdaFoods(foods, cleanedQuery) });
  } catch (error) {
    console.error("USDA FoodData Central request failed", error);
    return json({ products: [], unavailable: true });
  }
});
