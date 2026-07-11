import assert from "node:assert/strict";
import { mapUsdaFoods, selectUsdaFoods } from "./product";

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
  providerId: "1234567",
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
assert.equal(mapUsdaFoods([{ foodCategory: "Fruits and Fruit Juices" }], "banana")[0].category, "Fruit");
assert.equal(mapUsdaFoods([{ foodCategory: "Candy" }], "candy")[0].category, "Candy/Sweets");
assert.equal(mapUsdaFoods([{ foodCategory: "Chips, Pretzels & Snacks" }], "chips")[0].category, "Chips/Savory Snacks");
assert.equal(mapUsdaFoods([{ gtinUpc: "not-a-barcode" }], "chips")[0].barcode, undefined);
assert.equal(mapUsdaFoods([{ gtinUpc: "123456789012345" }], "chips")[0].barcode, undefined);
assert.equal(mapUsdaFoods([{ description: "x".repeat(300) }], "chips")[0].name.length, 160);

assert.deepEqual(selectUsdaFoods([
  { fdcId: 1, dataType: "Branded", description: "HONEYCRISP APPLES, HONEYCRISP", brandName: "MEIJER", gtinUpc: "11111111" },
  { fdcId: 2, dataType: "Branded", description: "HONEYCRISP APPLES, HONEYCRISP", brandName: "MEIJER", gtinUpc: "22222222" },
  { fdcId: 3, dataType: "Foundation", description: "Apples, honeycrisp, with skin, raw" },
  { fdcId: 4, dataType: "Branded", description: "Apple cider", brandName: "Other" },
], "honeycrisp").map((food) => food.fdcId), [3, 1]);

assert.deepEqual(selectUsdaFoods([
  { fdcId: 1, dataType: "Foundation", description: "Bananas, overripe, raw", foodCategory: "Fruits and Fruit Juices" },
  { fdcId: 2, dataType: "Foundation", description: "Bananas, ripe and slightly ripe, raw", foodCategory: "Fruits and Fruit Juices" },
  { fdcId: 3, dataType: "Foundation", description: "Peppers, banana or Hungarian wax, seeded, raw", foodCategory: "Vegetables and Vegetable Products" },
  { fdcId: 4, dataType: "Branded", description: "BANANA CHIPS, BANANA", brandName: "Snack Brand", foodCategory: "Wholesome Snacks" },
], "banana").map((food) => food.fdcId), [2]);

console.log("USDA product mapping tests passed");
