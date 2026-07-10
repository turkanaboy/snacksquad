import assert from "node:assert/strict";
import { castBracketVote, getContestOverview, mapContestOverview, nominateBracketSnack } from "./contestStore";

const raw = {
  week: {
    id: "week-1",
    week_start: "2026-07-13",
    status: "quarterfinals",
    nomination_closes_at: "2026-07-13T13:00:00Z",
    results_publish_at: "2026-07-17T13:00:00Z",
  },
  entries: [{ id: "entry-1", snack_id: "snack-1", seed: 1 }],
  owners: [{ entry_id: "entry-1", user_id: "user-1" }],
  matchups: [{
    id: "match-1",
    round_number: 2,
    position: 1,
    left_entry_id: "entry-1",
    right_entry_id: "entry-2",
    winner_entry_id: null,
    status: "open",
    closes_at: "2026-07-14T21:00:00Z",
  }],
  viewerVotes: [{ matchup_id: "match-1", entry_id: "entry-1" }],
};

assert.deepEqual(mapContestOverview(raw), {
  week: {
    id: "week-1",
    weekStart: "2026-07-13",
    status: "quarterfinals",
    nominationClosesAt: "2026-07-13T13:00:00Z",
    resultsPublishAt: "2026-07-17T13:00:00Z",
  },
  entries: [{ id: "entry-1", snackId: "snack-1", seed: 1, ownerIds: ["user-1"] }],
  matchups: [{
    id: "match-1",
    roundNumber: 2,
    position: 1,
    leftEntryId: "entry-1",
    rightEntryId: "entry-2",
    winnerEntryId: null,
    status: "open",
    closesAt: "2026-07-14T21:00:00Z",
  }],
  viewerVotes: [{ matchupId: "match-1", entryId: "entry-1" }],
});

const rpcCalls: Array<{ name: string; params: unknown }> = [];
const client = {
  rpc: async (name: string, params: unknown) => {
    rpcCalls.push({ name, params });
    if (name === "contest_overview") return { data: raw, error: null };
    return { data: null, error: null };
  },
};

assert.equal((await getContestOverview(client as never, "week-1"))?.week.id, "week-1");
await nominateBracketSnack(client as never, "week-1", "snack-1");
await castBracketVote(client as never, "match-1", "entry-1");
assert.deepEqual(rpcCalls, [
  { name: "contest_overview", params: { p_week_id: "week-1" } },
  { name: "nominate_bracket_snack", params: { p_week_id: "week-1", p_snack_id: "snack-1" } },
  { name: "cast_bracket_vote", params: { p_matchup_id: "match-1", p_entry_id: "entry-1" } },
]);

assert.equal(mapContestOverview(null), null);
assert.equal(mapContestOverview({ week: null }), null);

console.log("contest store tests passed");
