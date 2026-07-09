import assert from "node:assert/strict";
import {
  cleanImageUrl,
  cleanText,
  findExactDuplicate,
  findSimilarDuplicates,
  getSnackBadges,
  getWeekKey,
  getWeeklyBracket,
  normalizeSnackName,
  pickSnackOfTheDay,
  snacksToCsv,
  type Snack,
} from "./snackStore";

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
assert.equal(pickSnackOfTheDay(existing, new Date("2026-07-09"))?.name, "Doritos");

const csvSnack = {
  name: "Quote Crunch",
  category: "Sweet",
  score: 2,
  display_name: "Ada",
  note: 'Has "snap"',
  image_url: "",
} as Snack;
assert.match(snacksToCsv([csvSnack]), /"Has ""snap"""/);

const badgeSnack = {
  ...csvSnack,
  archived: false,
  comments: [{ id: "1" } as never],
  personal_rating: 5,
} as Snack;
assert.deepEqual(getSnackBadges([badgeSnack]).map((badge) => badge.label), [
  "Crowd favorite",
  "Most debated",
  "My favorite",
]);
assert.equal(getWeekKey(new Date("2026-07-09T00:00:00Z")), "2026-W28");
assert.equal(getWeeklyBracket([badgeSnack]).length, 1);

console.log("snack store tests passed");
