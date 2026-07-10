import assert from "node:assert/strict";

let handler: ((request: Request) => Promise<Response>) | undefined;
const denoGlobal = globalThis as typeof globalThis & { Deno?: unknown };
denoGlobal.Deno = {
  env: { get: () => "snacks@example.com" },
  serve: (nextHandler: typeof handler) => { handler = nextHandler; },
};

const originalFetch = globalThis.fetch;
const calls: Array<{ url: string; options?: RequestInit }> = [];
globalThis.fetch = async (input, options) => {
  const url = String(input);
  calls.push({ url, options });
  return Response.json(url.includes("/api/v3.6/product/")
    ? { product: { code: "3017624010701", product_name: "Nutella" } }
    : { hits: [{ code: "024100705509", product_name: "Cheez-It Original" }] });
};

await import("./index");
assert(handler);

const response = await handler(new Request("http://localhost/snack-metadata", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ query: " Cheez-It " }),
}));
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), {
  products: [{
    name: "Cheez-It Original",
    barcode: "024100705509",
    sourceUrl: "https://world.openfoodfacts.org/product/024100705509",
  }],
});
assert.match(calls[0].url, /^https:\/\/search\.openfoodfacts\.org\/search\?q=Cheez-It/);
assert.equal(new Headers(calls[0].options?.headers).get("User-Agent"), "SnackSquad/0.1 (snacks@example.com)");
assert(calls[0].options?.signal instanceof AbortSignal);

const barcodeResponse = await handler(new Request("http://localhost/snack-metadata", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ query: "3017624010701" }),
}));
assert.equal(barcodeResponse.status, 200);
assert.match(calls[1].url, /\/api\/v3\.6\/product\/3017624010701\.json/);

assert.equal((await handler(new Request("http://localhost/snack-metadata", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ query: "" }),
}))).status, 400);

globalThis.fetch = originalFetch;
delete denoGlobal.Deno;

console.log("snack metadata Edge Function tests passed");
