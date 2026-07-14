import assert from "node:assert/strict";

let handler: ((request: Request) => Promise<Response>) | undefined;
let apiKey = "test-usda-key";
const denoGlobal = globalThis as typeof globalThis & { Deno?: unknown };
denoGlobal.Deno = {
  env: { get: (name: string) => ({
    USDA_API_KEY: apiKey,
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_ANON_KEY: "test-public-key",
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: "sb_secret_current" }),
    SUPABASE_SERVICE_ROLE_KEY: "disabled-legacy-service-key",
  } as Record<string, string>)[name] },
  serve: (nextHandler: typeof handler) => { handler = nextHandler; },
};

const originalFetch = globalThis.fetch;
const originalConsoleError = console.error;
console.error = () => {};
const calls: Array<{ url: string; options?: RequestInit }> = [];
let fetchMode: "success" | "rate-limit" | "server-error" | "timeout" | "malformed" | "mixed" = "success";
globalThis.fetch = async (input, options) => {
  calls.push({ url: String(input), options });
  const url = new URL(String(input));
  if (url.pathname === "/auth/v1/user") return Response.json({ id: "11000000-0000-0000-0000-000000000001" });
  if (url.pathname === "/rest/v1/rpc/import_catalog_snack") return Response.json("21000000-0000-0000-0000-000000000001");
  if (url.pathname.startsWith("/fdc/v1/food/")) {
    const id = url.pathname.split("/").at(-1);
    if (id === "5") return Response.json({
      fdcId: 5,
      dataType: "Foundation",
      description: "Bananas, ripe and slightly ripe, raw",
      foodCategory: "Fruits and Fruit Juices",
    });
    return Response.json({ fdcId: Number(id), description: "Cheez-It Original", brandName: "Cheez-It", gtinUpc: "024100705509", foodCategory: "Crackers" });
  }
  if (fetchMode === "rate-limit") return Response.json({}, { status: 429 });
  if (fetchMode === "server-error") return Response.json({}, { status: 502 });
  if (fetchMode === "timeout") throw new DOMException("Timed out", "TimeoutError");
  if (fetchMode === "malformed") return Response.json({ foods: "not-an-array" });
  if (fetchMode === "mixed") return Response.json({ foods: [null, "bad", [], { fdcId: 4, description: "Valid pretzel" }] });
  const query = JSON.parse(String(options?.body)).query;
  return Response.json({
    foods: query === "3017624010701"
      ? [
        { fdcId: 2, description: "Wrong result", gtinUpc: "000000000000" },
        { fdcId: 3, description: "Nutella", gtinUpc: "03017624010701" },
      ]
      : [{ fdcId: 1, description: "Cheez-It Original", brandName: "Cheez-It", gtinUpc: "024100705509", foodCategory: "Crackers" }],
  });
};

await import("./index");
assert(handler);

const response = await handler(new Request("http://localhost/snack-metadata", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
  body: JSON.stringify({ query: " Cheez-It " }),
}));
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), {
  products: [{
    providerId: "1",
    name: "Cheez-It Original",
    brand: "Cheez-It",
    category: "Grains/Bakery",
    sourceCategories: ["Crackers"],
    barcode: "00024100705509",
    sourceUrl: "https://fdc.nal.usda.gov/fdc-app.html#/food-details/1/nutrients",
    nutritionComplete: false,
  }],
});
const searchCalls = () => calls.filter((call) => new URL(call.url).pathname === "/fdc/v1/foods/search");
assert.equal(new URL(searchCalls()[0].url).origin, "https://api.nal.usda.gov");
assert.equal(new URL(searchCalls()[0].url).searchParams.get("api_key"), "test-usda-key");
assert.equal(searchCalls()[0].options?.method, "POST");
assert.deepEqual(JSON.parse(String(searchCalls()[0].options?.body)), {
  query: "Cheez-It",
  dataType: ["Foundation", "Branded"],
  pageSize: 25,
});
assert(calls[0].options?.signal instanceof AbortSignal);

const barcodeResponse = await handler(new Request("http://localhost/snack-metadata", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
  body: JSON.stringify({ query: "3017624010701" }),
}));
assert.equal(barcodeResponse.status, 200);
assert.deepEqual(await barcodeResponse.json(), {
  products: [{
    providerId: "3",
    name: "Nutella",
    barcode: "03017624010701",
    sourceUrl: "https://fdc.nal.usda.gov/fdc-app.html#/food-details/3/nutrients",
    nutritionComplete: false,
  }],
});
assert.deepEqual(JSON.parse(String(searchCalls()[1].options?.body)), {
  query: "3017624010701",
  dataType: ["Branded"],
  pageSize: 8,
});

assert.equal((await handler(new Request("http://localhost/snack-metadata", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
  body: JSON.stringify({ query: "" }),
}))).status, 400);

assert.equal((await handler(new Request("http://localhost/snack-metadata", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
  body: "null",
}))).status, 400);

assert.equal((await handler(new Request("http://localhost/snack-metadata", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ query: "chips" }),
}))).status, 401);

apiKey = "";
assert.equal((await handler(new Request("http://localhost/snack-metadata", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
  body: JSON.stringify({ query: "chips" }),
}))).status, 503);
apiKey = "test-usda-key";

const importResponse = await handler(new Request("http://localhost/snack-metadata", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
  body: JSON.stringify({ importId: "5" }),
}));
assert.equal(importResponse.status, 200);
assert.deepEqual(await importResponse.json(), { snackId: "21000000-0000-0000-0000-000000000001" });
const importCall = calls.find((call) => new URL(call.url).pathname === "/rest/v1/rpc/import_catalog_snack");
assert(importCall);
assert.equal((importCall.options?.headers as Record<string, string>).apikey, "sb_secret_current");
assert.equal((importCall.options?.headers as Record<string, string>).Authorization, undefined);
assert.deepEqual(JSON.parse(String(importCall.options?.body)), {
  p_name: "Bananas, ripe and slightly ripe, raw",
  p_brand: null,
  p_barcode: null,
  p_category: "Fruit",
  p_source_categories: ["Fruits and Fruit Juices"],
  p_image_url: null,
  p_source_url: "https://fdc.nal.usda.gov/fdc-app.html#/food-details/5/nutrients",
  p_nutrition_complete: false,
  p_created_by: "11000000-0000-0000-0000-000000000001",
});

fetchMode = "mixed";
const mixedResponse = await handler(new Request("http://localhost/snack-metadata", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
  body: JSON.stringify({ query: "pretzel" }),
}));
assert.deepEqual(await mixedResponse.json(), {
  products: [{
    providerId: "4",
    name: "Valid pretzel",
    sourceUrl: "https://fdc.nal.usda.gov/fdc-app.html#/food-details/4/nutrients",
    nutritionComplete: false,
  }],
});

for (const mode of ["rate-limit", "server-error", "timeout", "malformed"] as const) {
  fetchMode = mode;
  const unavailableResponse = await handler(new Request("http://localhost/snack-metadata", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
    body: JSON.stringify({ query: "chips" }),
  }));
  assert.equal(unavailableResponse.status, 200);
  assert.deepEqual(await unavailableResponse.json(), { products: [], unavailable: true });
}

globalThis.fetch = originalFetch;
console.error = originalConsoleError;
delete denoGlobal.Deno;

console.log("USDA snack metadata Edge Function tests passed");
