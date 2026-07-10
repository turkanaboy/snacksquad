import assert from "node:assert/strict";
import { friendlyError } from "./errors";
import {
  deriveDisplayName,
  getStoredDisplayName,
  isCompanyEmail,
  normalizeDisplayName,
  requestMagicLink,
  saveDisplayName,
} from "./profile";

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
assert.equal(normalizeDisplayName("x".repeat(100)).length, 80);
assert.equal(deriveDisplayName("ada.lovelace@carnegiehighered.com"), "Ada Lovelace");
assert.equal(deriveDisplayName("grace_hopper@carnegiehighered.com"), "Grace Hopper");
assert.equal(isCompanyEmail(" Ada@CARNEGIEHIGHERED.COM "), true);
assert.equal(isCompanyEmail("ada@other.example"), false);
assert.equal(isCompanyEmail("ada@example.com@carnegiehighered.com"), false);
assert.equal(getStoredDisplayName(storage), "Snack Fan");
assert.equal(saveDisplayName(" Grace ", storage), "Grace");
assert.equal(getStoredDisplayName(storage), "Grace");

let requestedEmail = "";
let requestedRedirect = "";
await requestMagicLink(
  {
    auth: {
      signInWithOtp: async ({ email, options }) => {
        requestedEmail = email;
        requestedRedirect = options?.emailRedirectTo || "";
        return { data: { user: null, session: null }, error: null };
      },
    },
  },
  " Ada@CARNEGIEHIGHERED.COM ",
  "https://snacks.example/auth/callback",
);
assert.equal(requestedEmail, "ada@carnegiehighered.com");
assert.equal(requestedRedirect, "https://snacks.example/auth/callback");
await assert.rejects(
  requestMagicLink(
    {
      auth: {
        signInWithOtp: async () => {
          throw new Error("should not call Supabase");
        },
      },
    },
    "ada@other.example",
  ),
  /carnegiehighered\.com/,
);
assert.match(friendlyError(new Error("Anonymous sign-ins are disabled")), /Enable them in Auth settings/);
assert.match(friendlyError(new Error("permission denied for table snacks")), /API grants migration/);

console.log("profile tests passed");
