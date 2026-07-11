import assert from "node:assert/strict";

let handler: ((request: Request) => Promise<Response>) | undefined;
let apiKey = "test-usda-key";
const denoGlobal = globalThis as typeof globalThis & { Deno?: unknown };
denoGlobal.Deno = {
  env: { get: (name: string) => name === "USDA_API_KEY" ? apiKey : undefined },
  serve: (nextHandler: typeof handler) => { handler = nextHandler; },
};

const originalFetch = globalThis.fetch;
const originalConsoleError = console.error;
console.error = () => {};
const calls: Array<{ url: string; options?: RequestInit }> = [];
let fetchMode: "success" | "rate-limit" | "server-error" | "timeout" | "malformed" | "mixed" = "success";
globalThis.fetch = async (input, options) => {
  calls.push({ url: String(input), options });
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
    name: "Cheez-It Original",
    brand: "Cheez-It",
    category: "Grains/Bakery",
    sourceCategories: ["Crackers"],
    barcode: "00024100705509",
    sourceUrl: "https://fdc.nal.usda.gov/fdc-app.html#/food-details/1/nutrients",
    nutritionComplete: false,
  }],
});
assert.equal(new URL(calls[0].url).origin, "https://api.nal.usda.gov");
assert.equal(new URL(calls[0].url).pathname, "/fdc/v1/foods/search");
assert.equal(new URL(calls[0].url).searchParams.get("api_key"), "test-usda-key");
assert.equal(calls[0].options?.method, "POST");
assert.deepEqual(JSON.parse(String(calls[0].options?.body)), {
  query: "Cheez-It",
  dataType: ["Branded"],
  pageSize: 8,
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
    name: "Nutella",
    barcode: "03017624010701",
    sourceUrl: "https://fdc.nal.usda.gov/fdc-app.html#/food-details/3/nutrients",
    nutritionComplete: false,
  }],
});

assert.equal((await handler(new Request("http://localhost/snack-metadata", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
  body: JSON.stringify({ query: "" }),
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

fetchMode = "mixed";
const mixedResponse = await handler(new Request("http://localhost/snack-metadata", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
  body: JSON.stringify({ query: "pretzel" }),
}));
assert.deepEqual(await mixedResponse.json(), {
  products: [{
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
