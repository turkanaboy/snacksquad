import assert from "node:assert/strict";
import {
  createSnackLog,
  getBoard,
  getLeaderboard,
  mapBoardEntry,
  mapLeaderboardItem,
  removeSnackLog,
  setLogUpvote,
} from "./snackStore";

assert.deepEqual(mapBoardEntry({
  log_id: "log-1",
  snack_id: "snack-1",
  snack_name: "Pretzels",
  category: "Grains/Bakery",
  image_url: null,
  logger_id: "user-1",
  logger_name: "Alex",
  logged_at: "2026-07-10T14:00:00Z",
  upvote_count: 3,
  viewer_upvoted: true,
}), {
  id: "log-1",
  snackId: "snack-1",
  snackName: "Pretzels",
  category: "Grains/Bakery",
  imageUrl: null,
  loggerId: "user-1",
  loggerName: "Alex",
  loggedAt: "2026-07-10T14:00:00Z",
  upvoteCount: 3,
  viewerUpvoted: true,
});

assert.deepEqual(mapLeaderboardItem({
  snack_id: "snack-1",
  snack_name: "Pretzels",
  category: "Grains/Bakery",
  log_count: 4,
  upvote_count: 7,
}), {
  snackId: "snack-1",
  snackName: "Pretzels",
  category: "Grains/Bakery",
  logCount: 4,
  upvoteCount: 7,
});

const calls: Array<{ name: string; params: unknown }> = [];
const rpcClient = {
  rpc: async (name: string, params: unknown) => {
    calls.push({ name, params });
    if (name === "board_feed") return { data: [], error: null };
    if (name === "snack_leaderboard") return { data: [], error: null };
    return { data: null, error: null };
  },
};
assert.deepEqual(await getBoard(rpcClient as never), []);
assert.deepEqual(await getLeaderboard(rpcClient as never), []);
assert.deepEqual(calls, [
  { name: "board_feed", params: { p_limit: 30, p_before: null } },
  { name: "snack_leaderboard", params: { p_days: 30, p_limit: 10 } },
]);

const writes: Array<{ table: string; action: string; payload: unknown }> = [];
function table(actionResult: { data?: unknown; error: null } = { error: null }) {
  return {
    insert(payload: unknown) {
      writes.push({ table: "", action: "insert", payload });
      return Promise.resolve(actionResult);
    },
    delete() {
      return {
        eq(column: string, value: string) {
          writes.push({ table: "", action: "delete", payload: { column, value } });
          return Promise.resolve(actionResult);
        },
      };
    },
  };
}
const writeClient = {
  auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
  from(name: string) {
    const query = table();
    const originalInsert = query.insert.bind(query);
    query.insert = (payload: unknown) => { writes.push({ table: name, action: "insert", payload }); return originalInsert(payload); };
    return query;
  },
};

await createSnackLog(writeClient as never, "snack-1");
await setLogUpvote(writeClient as never, "log-1", true);
await setLogUpvote(writeClient as never, "log-1", false);
await removeSnackLog(writeClient as never, "log-1");
assert(writes.some((write) => write.table === "snack_logs" && write.action === "insert"));
assert(writes.some((write) => write.table === "log_upvotes" && write.action === "insert"));

console.log("snack store tests passed");
