import assert from "node:assert/strict";
import { cleanImageUrl, cleanText, findExactDuplicate, findSimilarDuplicates, normalizeSnackName } from "./snackStore";

assert.equal(normalizeSnackName("  Cool   Ranch Doritos "), "cool ranch doritos");
assert.equal(cleanText("  chips "), "chips");
assert.equal(cleanText("   "), null);
assert.equal(cleanImageUrl(" https://example.com/chips.png "), "https://example.com/chips.png");
assert.throws(() => cleanImageUrl("ftp://example.com/chips.png"), /http/);

const existing = [
  { name: "Doritos", normalized_name: "doritos" },
  { name: "Peanut Butter Pretzels", normalized_name: "peanut butter pretzels" },
];

assert.deepEqual(findExactDuplicate(existing, " DORITOS "), existing[0]);
assert.equal(findExactDuplicate(existing, "Popcorn"), null);
assert.deepEqual(findSimilarDuplicates(existing, "butter pretzel bites"), [existing[1]]);

console.log("snack store tests passed");
