import type { SupabaseClient } from "@supabase/supabase-js";

export type ContestWeek = {
  id: string;
  weekStart: string;
  status: string;
  nominationClosesAt: string;
  resultsPublishAt: string;
  championEntryId: string | null;
};

export type ContestEntry = {
  id: string;
  snackId: string;
  seed: number | null;
  ownerIds: string[];
  snackName: string;
  category: string;
  imageUrl: string | null;
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
  leftVoteCount: number;
  rightVoteCount: number;
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
    champion_entry_id: string | null;
  } | null;
  entries?: Array<{
    id: string;
    snack_id: string;
    seed: number | null;
    snack_name: string;
    category: string;
    image_url: string | null;
  }>;
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
    left_vote_count?: number;
    right_vote_count?: number;
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
      championEntryId: raw.week.champion_entry_id || null,
    },
    entries: (raw.entries || []).map((entry) => ({
      id: entry.id,
      snackId: entry.snack_id,
      seed: entry.seed,
      ownerIds: owners.filter((owner) => owner.entry_id === entry.id).map((owner) => owner.user_id),
      snackName: entry.snack_name,
      category: entry.category,
      imageUrl: entry.image_url,
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
      leftVoteCount: Number(matchup.left_vote_count || 0),
      rightVoteCount: Number(matchup.right_vote_count || 0),
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

export type WeeklyReport = {
  weekId: string;
  reportDate: string;
  publishedAt: string;
  topSnackId: string | null;
  nutritionSnackId: string | null;
  bracketChampionEntryId: string | null;
  leaderboard: Array<{ snackId: string; snackName: string; logCount: number; upvoteCount: number }>;
};

export type BadgeTenure = { key: string; label: string; startDate: string; endDate: string | null };

export async function getWeeklyReports(client: RpcClient, limit = 8): Promise<WeeklyReport[]> {
  const result = await client.rpc("weekly_report_feed", { p_limit: limit });
  if (result.error) throw result.error;
  return (result.data || []).map((row: {
    week_id: string;
    report_date: string;
    published_at: string;
    payload?: {
      topSnackId?: string | null;
      nutritionSnackId?: string | null;
      bracketChampionEntryId?: string | null;
      leaderboard?: Array<{ snack_id: string; snack_name: string; log_count: number; upvote_count: number }>;
    };
  }) => ({
    weekId: row.week_id,
    reportDate: row.report_date,
    publishedAt: row.published_at,
    topSnackId: row.payload?.topSnackId || null,
    nutritionSnackId: row.payload?.nutritionSnackId || null,
    bracketChampionEntryId: row.payload?.bracketChampionEntryId || null,
    leaderboard: (row.payload?.leaderboard || []).map((item) => ({
      snackId: item.snack_id,
      snackName: item.snack_name,
      logCount: Number(item.log_count),
      upvoteCount: Number(item.upvote_count),
    })),
  }));
}

export async function getProfileBadges(client: RpcClient, userId: string): Promise<BadgeTenure[]> {
  const result = await client.rpc("profile_badges", { p_user_id: userId });
  if (result.error) throw result.error;
  return (result.data || []).map((row: { badge_key: string; label: string; start_date: string; end_date: string | null }) => ({
    key: row.badge_key,
    label: row.label,
    startDate: row.start_date,
    endDate: row.end_date,
  }));
}
