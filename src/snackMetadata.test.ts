import assert from "node:assert/strict";
import {
  createSnackSearch,
  mergeSnackMetadata,
  saveSelectedSnack,
  searchSnackMetadata,
  toCatalogSnackParams,
} from "./snackMetadata";

const calls: Array<{ name: string; body?: unknown }> = [];
const client = {
  functions: {
    async invoke(name: string, options?: { body?: unknown }) {
      calls.push({ name, body: options?.body });
      return {
        data: {
          products: [{
            name: "Cheez-It Original",
            brand: "Cheez-It",
            category: "Crackers",
            barcode: "024100705509",
          }],
        },
        error: null,
      };
    },
  },
};

assert.deepEqual(await searchSnackMetadata(client, "   "), []);
assert.deepEqual(await searchSnackMetadata(client, " Cheez-It "), [{
  name: "Cheez-It Original",
  brand: "Cheez-It",
  category: "Crackers",
  barcode: "024100705509",
}]);
assert.deepEqual(calls, [{ name: "snack-metadata", body: { query: "Cheez-It" } }]);

assert.deepEqual(mergeSnackMetadata(
  [{ name: "Cheez-It", barcode: "024100705509" }],
  [{ name: "Cheez-It Original", barcode: "024100705509" }, { name: "Pretzels" }],
), [
  { name: "Cheez-It", barcode: "024100705509" },
  { name: "Pretzels" },
]);

const searchCalls: string[] = [];
const searchEvents: Array<{ query: string; names: string[] }> = [];
const search = createSnackSearch({
  local: async (query) => [{ name: `Local ${query}` }],
  remote: async (query) => {
    searchCalls.push(query);
    return [{ name: `Remote ${query}` }];
  },
}, (query, products) => {
  searchEvents.push({ query, names: products.map((product) => product.name) });
}, 5);

await search.search("ch");
await new Promise((resolve) => setTimeout(resolve, 10));
assert.deepEqual(searchCalls, []);
assert.deepEqual(searchEvents.at(-1), { query: "ch", names: ["Local ch"] });

const firstSearch = search.search("chee");
const finalSearch = search.search("cheez");
await Promise.all([firstSearch, finalSearch]);
await new Promise((resolve) => setTimeout(resolve, 15));
assert.deepEqual(searchCalls, ["cheez"]);
assert.deepEqual(searchEvents.at(-1), { query: "cheez", names: ["Local cheez", "Remote cheez"] });

await search.search("3017624010701");
assert.equal(searchCalls.at(-1), "3017624010701");
search.dispose();

assert.deepEqual(toCatalogSnackParams({
  name: "  Cheez-It   Original  ",
  brand: "Cheez-It",
  barcode: "024100705509",
  category: "Grains/Bakery",
  sourceCategories: ["en:crackers"],
  nutriScore: "c",
  nutritionComplete: true,
}), {
  p_name: "Cheez-It Original",
  p_brand: "Cheez-It",
  p_barcode: "024100705509",
  p_category: "Grains/Bakery",
  p_source_categories: ["en:crackers"],
  p_image_url: null,
  p_source_url: null,
  p_nutri_score: "c",
  p_nutrition_complete: true,
});

let rpcParams: unknown;
assert.equal(await saveSelectedSnack({
  rpc: async (name: string, params: unknown) => {
    assert.equal(name, "upsert_catalog_snack");
    rpcParams = params;
    return { data: "snack-id", error: null } as never;
  },
} as never, { name: "Pretzels", category: "Unexpected" }), "snack-id");
assert.equal((rpcParams as { p_category: string }).p_category, "Other");

await assert.rejects(
  () => searchSnackMetadata({
    functions: {
      async invoke() {
        return { data: null, error: { message: "FunctionsHttpError" } };
      },
    },
  }, "chips"),
  /Could not search snack metadata yet/,
);

console.log("snack metadata tests passed");
