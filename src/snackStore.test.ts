import assert from "node:assert/strict";
import { cleanText, findExactDuplicate, normalizeSnackName } from "./snackStore";

assert.equal(normalizeSnackName("  Cool   Ranch Doritos "), "cool ranch doritos");
assert.equal(cleanText("  chips "), "chips");
assert.equal(cleanText("   "), null);

const existing = [
  { normalized_name: "doritos" },
  { normalized_name: "peanut butter pretzels" },
];

assert.deepEqual(findExactDuplicate(existing, " DORITOS "), existing[0]);
assert.equal(findExactDuplicate(existing, "Popcorn"), null);

console.log("snack store tests passed");
