import assert from "node:assert/strict";
import { mapUsdaFoods } from "./product";

const completeNutrients = [
  { nutrientName: "Energy", value: 450, unitName: "KCAL" },
  { nutrientName: "Protein", value: 9, unitName: "G" },
  { nutrientName: "Total lipid (fat)", value: 18, unitName: "G" },
  { nutrientName: "Carbohydrate, by difference", value: 64, unitName: "G" },
  { nutrientName: "Sugars, Total including NLEA", value: 4, unitName: "G" },
  { nutrientName: "Fiber, total dietary", value: 3, unitName: "G" },
  { nutrientName: "Calcium, Ca", value: 20, unitName: "MG" },
  { nutrientName: "Sodium, Na", value: 900, unitName: "MG" },
  { nutrientName: "Fatty acids, total saturated", value: 3, unitName: "G" },
];

assert.deepEqual(mapUsdaFoods([{
  fdcId: 1234567,
  description: "PRETZELS, ORIGINAL",
  brandName: "Snack Co",
  brandOwner: "Snack Holdings LLC",
  gtinUpc: "012345678905",
  foodCategory: "Chips, Pretzels & Snacks",
  foodNutrients: completeNutrients,
}], "pretzel"), [{
  name: "PRETZELS, ORIGINAL",
  brand: "Snack Co",
  category: "Chips/Savory Snacks",
  sourceCategories: ["Chips, Pretzels & Snacks"],
  barcode: "00012345678905",
  sourceUrl: "https://fdc.nal.usda.gov/fdc-app.html#/food-details/1234567/nutrients",
  nutritionComplete: true,
}]);

assert.deepEqual(mapUsdaFoods([{ brandOwner: "Fallback Brand" }], "cheese"), [{
  name: "cheese",
  brand: "Fallback Brand",
  nutritionComplete: false,
}]);
assert.equal(mapUsdaFoods([{ foodCategory: "Cheese" }], "cheese")[0].category, "Dairy");
assert.equal(mapUsdaFoods([{ foodCategory: "Candy" }], "candy")[0].category, "Candy/Sweets");
assert.equal(mapUsdaFoods([{ foodCategory: "Chips, Pretzels & Snacks" }], "chips")[0].category, "Chips/Savory Snacks");
assert.equal(mapUsdaFoods([{ gtinUpc: "not-a-barcode" }], "chips")[0].barcode, undefined);
assert.equal(mapUsdaFoods([{ gtinUpc: "123456789012345" }], "chips")[0].barcode, undefined);
assert.equal(mapUsdaFoods([{ description: "x".repeat(300) }], "chips")[0].name.length, 160);

console.log("USDA product mapping tests passed");
