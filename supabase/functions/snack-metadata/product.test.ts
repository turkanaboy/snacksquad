import assert from "node:assert/strict";
import { mapOpenFoodFactsProducts } from "./product";

assert.deepEqual(mapOpenFoodFactsProducts([
  {
    code: "024100705509",
    product_name: "Cheez-It Original",
    brands: ["Cheez-It"],
    categories: "Crackers, Snacks",
    image_url: "https://images.openfoodfacts.org/cheez-it.jpg",
  },
], "Cheez-It"), [{
  name: "Cheez-It Original",
  brand: "Cheez-It",
  category: "Crackers, Snacks",
  imageUrl: "https://images.openfoodfacts.org/cheez-it.jpg",
  barcode: "024100705509",
  sourceUrl: "https://world.openfoodfacts.org/product/024100705509",
}]);

assert.deepEqual(mapOpenFoodFactsProducts([{ generic_name: "Corn chips" }], "chips"), [{ name: "Corn chips" }]);
assert.deepEqual(mapOpenFoodFactsProducts([{}], "chips"), [{ name: "chips" }]);

console.log("Open Food Facts product mapping tests passed");
