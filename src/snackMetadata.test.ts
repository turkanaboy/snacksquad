import assert from "node:assert/strict";
import {
  createSnackSearch,
  listSnackCorrections,
  mergeSnackMetadata,
  saveSelectedSnack,
  searchSnackMetadata,
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

assert.deepEqual(await listSnackCorrections({
  from: () => ({
    select: () => ({
      order: async () => ({
        data: [{
          id: "correction-1",
          snack_id: "snack-1",
          proposed_changes: { name: "Baby Carrots" },
          reason: "Use the package name.",
          status: "pending",
          created_at: "2026-07-12T12:00:00Z",
          snacks: { name: "Carrots", brand: "Fresh", category: "Vegetables" },
        }],
        error: null,
      }),
    }),
  }),
} as never), [{
  id: "correction-1",
  snackId: "snack-1",
  snackName: "Carrots",
  currentValues: { name: "Carrots", brand: "Fresh", category: "Vegetables" },
  proposedChanges: { name: "Baby Carrots" },
  reason: "Use the package name.",
  status: "pending",
  createdAt: "2026-07-12T12:00:00Z",
}]);

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
});

await search.search("ch");
assert.deepEqual(searchCalls, []);
assert.deepEqual(searchEvents.at(-1), { query: "ch", names: ["Local ch"] });

const firstSearch = search.search("chee");
const finalSearch = search.search("cheez");
await Promise.all([firstSearch, finalSearch]);
assert.deepEqual(searchCalls, []);
assert.deepEqual(searchEvents.at(-1), { query: "cheez", names: ["Local cheez"] });

await search.searchRemote("cheez");
assert.deepEqual(searchCalls, ["cheez"]);
assert.deepEqual(searchEvents.at(-1), { query: "cheez", names: ["Local cheez", "Remote cheez"] });

await search.searchRemote("3017624010701");
assert.equal(searchCalls.at(-1), "3017624010701");
search.dispose();

assert.equal(await saveSelectedSnack({
  functions: {
    async invoke(name: string, options: { body: unknown }) {
      assert.equal(name, "snack-metadata");
      assert.deepEqual(options.body, { importId: "123" });
      return { data: { snackId: "snack-id" }, error: null };
    },
  },
} as never, { providerId: "123", name: "Pretzels" }), "snack-id");

await assert.rejects(
  () => saveSelectedSnack({ functions: { invoke: async () => ({ data: null, error: null }) } } as never, { name: "Untrusted" }),
  /verified catalog result/,
);

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

await assert.rejects(
  () => searchSnackMetadata({
    functions: {
      async invoke() {
        return { data: { products: [], unavailable: true }, error: null };
      },
    },
  }, "chips"),
  /temporarily unavailable/,
);

const outageCalls: string[] = [];
const outageErrors: string[] = [];
const outageSearch = createSnackSearch({
  local: async () => [],
  remote: async (query) => {
    outageCalls.push(query);
    throw new Error("Remote unavailable");
  },
}, () => {}, (query) => outageErrors.push(query), 60_000);

await outageSearch.searchRemote("pretzel");
await outageSearch.searchRemote("cheese");
assert.deepEqual(outageCalls, ["pretzel"]);
assert.deepEqual(outageErrors, ["pretzel", "cheese"]);

await outageSearch.searchRemote("3017624010701");
assert.deepEqual(outageCalls, ["pretzel", "3017624010701"]);
outageSearch.dispose();

const localErrors: string[] = [];
const failedLocalSearch = createSnackSearch({
  local: async () => { throw new Error("Local unavailable"); },
  remote: async () => [],
}, () => {}, (query) => localErrors.push(query));
await failedLocalSearch.search("chips");
assert.deepEqual(localErrors, ["chips"]);

console.log("snack metadata tests passed");
