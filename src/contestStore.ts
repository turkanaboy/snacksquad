import type { SupabaseClient } from "@supabase/supabase-js";

export type ContestWeek = {
  id: string;
  weekStart: string;
  status: string;
  nominationClosesAt: string;
  resultsPublishAt: string;
};

export type ContestEntry = {
  id: string;
  snackId: string;
  seed: number | null;
  ownerIds: string[];
};

export type ContestMatchup = {
  id: string;
  roundNumber: number;
  position: number;
  leftEntryId: string;
  rightEntryId: string | null;
  winnerEntryId: string | null;
  status: string;
  closesAt: string;
};

export type ContestOverview = {
  week: ContestWeek;
  entries: ContestEntry[];
  matchups: ContestMatchup[];
  viewerVotes: Array<{ matchupId: string; entryId: string }>;
};

type RawOverview = {
  week?: {
    id: string;
    week_start: string;
    status: string;
    nomination_closes_at: string;
    results_publish_at: string;
  } | null;
  entries?: Array<{ id: string; snack_id: string; seed: number | null }>;
  owners?: Array<{ entry_id: string; user_id: string }>;
  matchups?: Array<{
    id: string;
    round_number: number;
    position: number;
    left_entry_id: string;
    right_entry_id: string | null;
    winner_entry_id: string | null;
    status: string;
    closes_at: string;
  }>;
  viewerVotes?: Array<{ matchup_id: string; entry_id: string }>;
};

export function mapContestOverview(value: unknown): ContestOverview | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as RawOverview;
  if (!raw.week?.id) return null;
  const owners = raw.owners || [];
  return {
    week: {
      id: raw.week.id,
      weekStart: raw.week.week_start,
      status: raw.week.status,
      nominationClosesAt: raw.week.nomination_closes_at,
      resultsPublishAt: raw.week.results_publish_at,
    },
    entries: (raw.entries || []).map((entry) => ({
      id: entry.id,
      snackId: entry.snack_id,
      seed: entry.seed,
      ownerIds: owners.filter((owner) => owner.entry_id === entry.id).map((owner) => owner.user_id),
    })),
    matchups: (raw.matchups || []).map((matchup) => ({
      id: matchup.id,
      roundNumber: matchup.round_number,
      position: matchup.position,
      leftEntryId: matchup.left_entry_id,
      rightEntryId: matchup.right_entry_id,
      winnerEntryId: matchup.winner_entry_id,
      status: matchup.status,
      closesAt: matchup.closes_at,
    })),
    viewerVotes: (raw.viewerVotes || []).map((vote) => ({
      matchupId: vote.matchup_id,
      entryId: vote.entry_id,
    })),
  };
}

type RpcClient = Pick<SupabaseClient, "rpc">;

export async function getContestOverview(client: RpcClient, weekId: string): Promise<ContestOverview | null> {
  const result = await client.rpc("contest_overview", { p_week_id: weekId });
  if (result.error) throw result.error;
  return mapContestOverview(result.data);
}

export async function getCurrentContestOverview(client: RpcClient): Promise<ContestOverview | null> {
  const result = await client.rpc("current_contest_overview");
  if (result.error) throw result.error;
  return mapContestOverview(result.data);
}

export async function nominateBracketSnack(client: RpcClient, weekId: string, snackId: string): Promise<void> {
  const result = await client.rpc("nominate_bracket_snack", { p_week_id: weekId, p_snack_id: snackId });
  if (result.error) throw result.error;
}

export async function castBracketVote(client: RpcClient, matchupId: string, entryId: string): Promise<void> {
  const result = await client.rpc("cast_bracket_vote", { p_matchup_id: matchupId, p_entry_id: entryId });
  if (result.error) throw result.error;
}
