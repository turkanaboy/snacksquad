import assert from "node:assert/strict";
import { friendlyError } from "./errors";
import { deriveDisplayName, isCompanyEmail, loadPublicProfile, normalizeDisplayName, requestMagicLink } from "./profile";

assert.equal(normalizeDisplayName("  Ada   Lovelace "), "Ada Lovelace");
assert.equal(normalizeDisplayName("   "), "Snack Fan");
assert.equal(normalizeDisplayName("x".repeat(100)).length, 80);
assert.equal(deriveDisplayName("ada.lovelace@carnegiehighered.com"), "Ada Lovelace");
assert.equal(isCompanyEmail(" Ada@CARNEGIEHIGHERED.COM "), true);
assert.equal(isCompanyEmail("ada@other.example"), false);
assert.equal(isCompanyEmail("ada@example.com@carnegiehighered.com"), false);

let requestedEmail = "";
await requestMagicLink({
  auth: {
    signInWithOtp: async ({ email }: { email: string }) => {
      requestedEmail = email;
      return { error: null };
    },
  },
} as never, " Ada@CARNEGIEHIGHERED.COM ");
assert.equal(requestedEmail, "ada@carnegiehighered.com");

const publicProfile = await loadPublicProfile({
  rpc: async (name: string) => name === "profile_summary"
    ? { data: [{
      user_id: "user-1", display_name: "Ada", favorite_snack_id: null, favorite_snack_name: null,
      total_logs: 4, distinct_snacks: 3, category_mix: { Fruit: 2 },
    }], error: null }
    : { data: [{ badge_key: "top-snack", label: "Top Snack", start_date: "2026-07-10", end_date: null }], error: null },
} as never, "user-1");
assert.equal(publicProfile.totalLogs, 4);
assert.deepEqual(publicProfile.badges.map((badge) => badge.key), ["top-snack"]);

assert.match(friendlyError(new Error("Only @carnegiehighered.com email addresses can join Snack Squad.")), /company email/i);
assert.match(friendlyError(new Error("Email link is invalid or has expired")), /expired/i);
assert.match(friendlyError(new TypeError("Failed to fetch")), /connect/i);
assert.doesNotMatch(friendlyError(new Error('duplicate key violates constraint "snack_logs_user_id_snack_id_logged_on_key"')), /constraint|snack_logs/i);
assert.doesNotMatch(friendlyError(new Error('new row violates row-level security policy for table "snacks"')), /security|snacks/i);

console.log("profile tests passed");
