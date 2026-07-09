import assert from "node:assert/strict";
import { getStoredDisplayName, normalizeDisplayName, saveDisplayName } from "./profile";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const storage = new MemoryStorage();

assert.equal(normalizeDisplayName("  Ada   Lovelace "), "Ada Lovelace");
assert.equal(normalizeDisplayName("   "), "Snack Fan");
assert.equal(getStoredDisplayName(storage), "Snack Fan");
assert.equal(saveDisplayName(" Grace ", storage), "Grace");
assert.equal(getStoredDisplayName(storage), "Grace");

console.log("profile tests passed");
