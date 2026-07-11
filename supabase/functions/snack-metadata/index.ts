import { mapOpenFoodFactsProducts, type OpenFoodFactsProduct } from "./product.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: corsHeaders,
  });
}

function openFoodFactsUrl(query: string) {
  if (/^\d{8,14}$/.test(query)) {
    const url = new URL(`https://world.openfoodfacts.org/api/v3.6/product/${query}.json`);
    url.searchParams.set("fields", "code,product_name,generic_name,brands,categories,categories_tags,image_url,url,nutrition_grades,nutriments");
    return { url, barcode: true };
  }

  const url = new URL("https://search.openfoodfacts.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("page_size", "3");
  url.searchParams.set("fields", "code,product_name,generic_name,brands,categories,categories_tags,image_url,url,nutrition_grades,nutriments");
  return { url, barcode: false };
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

  const contact = Deno.env.get("OPEN_FOOD_FACTS_CONTACT")?.trim();
  if (!contact) return json({ error: "Open Food Facts contact is not configured." }, 503);

  const { url, barcode } = openFoodFactsUrl(cleanedQuery);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": `SnackSquad/0.1 (${contact})`,
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      return json({ products: [], unavailable: true });
    }

    const data = await response.json() as {
      product?: OpenFoodFactsProduct;
      hits?: unknown;
    };
    if (!barcode && !Array.isArray(data.hits)) return json({ products: [], unavailable: true });
    const products = barcode ? (data.product ? [data.product] : []) : data.hits as OpenFoodFactsProduct[];
    return json({ products: mapOpenFoodFactsProducts(products, cleanedQuery) });
  } catch (error) {
    console.error("Open Food Facts request failed", error);
    return json({ products: [], unavailable: true });
  }
});
