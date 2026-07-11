import assert from "node:assert/strict";

let handler: ((request: Request) => Promise<Response>) | undefined;
const denoGlobal = globalThis as typeof globalThis & { Deno?: unknown };
denoGlobal.Deno = {
  env: { get: () => "snacks@example.com" },
  serve: (nextHandler: typeof handler) => { handler = nextHandler; },
};

const originalFetch = globalThis.fetch;
const originalConsoleError = console.error;
console.error = () => {};
const calls: Array<{ url: string; options?: RequestInit }> = [];
let fetchMode: "success" | "rate-limit" | "server-error" | "timeout" | "malformed" = "success";
globalThis.fetch = async (input, options) => {
  const url = String(input);
  calls.push({ url, options });
  if (fetchMode === "rate-limit") return Response.json({}, { status: 429 });
  if (fetchMode === "server-error") return Response.json({}, { status: 502 });
  if (fetchMode === "timeout") throw new DOMException("Timed out", "TimeoutError");
  if (fetchMode === "malformed") return Response.json({ hits: "not-an-array" });
  return Response.json(url.includes("/api/v3.6/product/")
    ? { product: { code: "3017624010701", product_name: "Nutella" } }
    : { hits: [{ code: "024100705509", product_name: "Cheez-It Original" }] });
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
    barcode: "024100705509",
    sourceUrl: "https://world.openfoodfacts.org/product/024100705509",
  }],
});
assert.match(calls[0].url, /^https:\/\/search\.openfoodfacts\.org\/search\?q=Cheez-It/);
assert.match(calls[0].url, /nutrition_grades/);
assert.equal(new Headers(calls[0].options?.headers).get("User-Agent"), "SnackSquad/0.1 (snacks@example.com)");
assert(calls[0].options?.signal instanceof AbortSignal);

const barcodeResponse = await handler(new Request("http://localhost/snack-metadata", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
  body: JSON.stringify({ query: "3017624010701" }),
}));
assert.equal(barcodeResponse.status, 200);
assert.match(calls[1].url, /\/api\/v3\.6\/product\/3017624010701\.json/);

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

fetchMode = "rate-limit";
const rateLimitResponse = await handler(new Request("http://localhost/snack-metadata", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
  body: JSON.stringify({ query: "chips" }),
}));
assert.equal(rateLimitResponse.status, 200);
assert.deepEqual(await rateLimitResponse.json(), { products: [], unavailable: true });

fetchMode = "server-error";
const serverErrorResponse = await handler(new Request("http://localhost/snack-metadata", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
  body: JSON.stringify({ query: "chips" }),
}));
assert.equal(serverErrorResponse.status, 200);
assert.deepEqual(await serverErrorResponse.json(), { products: [], unavailable: true });

fetchMode = "timeout";
const timeoutResponse = await handler(new Request("http://localhost/snack-metadata", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
  body: JSON.stringify({ query: "chips" }),
}));
assert.equal(timeoutResponse.status, 200);
assert.deepEqual(await timeoutResponse.json(), { products: [], unavailable: true });

fetchMode = "malformed";
const malformedResponse = await handler(new Request("http://localhost/snack-metadata", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
  body: JSON.stringify({ query: "chips" }),
}));
assert.equal(malformedResponse.status, 200);
assert.deepEqual(await malformedResponse.json(), { products: [], unavailable: true });

globalThis.fetch = originalFetch;
console.error = originalConsoleError;
delete denoGlobal.Deno;

console.log("snack metadata Edge Function tests passed");
