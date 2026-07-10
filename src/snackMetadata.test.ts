import assert from "node:assert/strict";
import { searchSnackMetadata } from "./snackMetadata";

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
