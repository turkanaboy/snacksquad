import assert from "node:assert/strict";
import { searchSnackMetadata } from "./snackMetadata";

assert.deepEqual(await searchSnackMetadata("   "), []);

console.log("snack metadata tests passed");
