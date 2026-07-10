import assert from "node:assert/strict";
import { mapOpenFoodFactsProducts } from "./product";

assert.deepEqual(mapOpenFoodFactsProducts([
  {
    code: "024100705509",
    product_name: "Cheez-It Original",
    brands: ["Cheez-It"],
    categories: "Crackers, Snacks",
    categories_tags: ["en:crackers", "en:snacks"],
    image_url: "https://images.openfoodfacts.org/cheez-it.jpg",
    nutrition_grades: "c",
    nutriments: {
      "energy-kcal_100g": 500,
      fat_100g: 25,
      "saturated-fat_100g": 5,
      carbohydrates_100g: 60,
      sugars_100g: 7,
      proteins_100g: 10,
      salt_100g: 1.2,
    },
  },
], "Cheez-It"), [{
  name: "Cheez-It Original",
  brand: "Cheez-It",
  category: "Grains/Bakery",
  sourceCategories: ["en:crackers", "en:snacks"],
  imageUrl: "https://images.openfoodfacts.org/cheez-it.jpg",
  barcode: "024100705509",
  sourceUrl: "https://world.openfoodfacts.org/product/024100705509",
  nutriScore: "c",
  nutritionComplete: true,
}]);

assert.deepEqual(mapOpenFoodFactsProducts([{ generic_name: "Corn chips" }], "chips"), [{ name: "Corn chips" }]);
assert.deepEqual(mapOpenFoodFactsProducts([{}], "chips"), [{ name: "chips" }]);
assert.equal(mapOpenFoodFactsProducts([{ categories_tags: ["en:potato-chips"] }], "chips")[0].category, "Chips/Savory Snacks");
assert.equal(mapOpenFoodFactsProducts([{ categories_tags: ["en:yogurts"] }], "yogurt")[0].category, "Dairy");
assert.equal(mapOpenFoodFactsProducts([{ categories_tags: ["en:apples"] }], "apple")[0].category, "Fruit");
assert.equal(mapOpenFoodFactsProducts([{ image_url: "http://insecure.example/image.png" }], "chips")[0].imageUrl, undefined);
assert.equal(mapOpenFoodFactsProducts([{ product_name: "x".repeat(300) }], "chips")[0].name.length, 160);

console.log("Open Food Facts product mapping tests passed");
