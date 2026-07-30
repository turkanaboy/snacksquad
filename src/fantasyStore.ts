import type { SupabaseClient } from "@supabase/supabase-js";

type RpcClient = Pick<SupabaseClient, "rpc">;
export type FantasyFeatureState = { enabled: boolean; weeksObserved: number; dailyActiveUsers: number; fullBracketParticipation: boolean; weeklyUserGrowth: boolean; averageLogsPerUserWeek: number };
export type FantasyLeague = { id: string; name: string; joinCode: string; memberCount: number; isCreator: boolean };
export type FantasyRosterSlot = { userId: string; snackId: string; snackName: string; category: string };
export const FANTASY_ROSTER_CATEGORIES = ["Grains/Bakery", "Fruit", "Vegetable", "Candy/Chips", "Protein"] as const;
export type FantasyRosterCategory = typeof FANTASY_ROSTER_CATEGORIES[number];
export type FantasyTeamSlot = { category: FantasyRosterCategory; snack: FantasyRosterSlot | null };
export type FantasyMember = { userId: string; displayName: string };
export type FantasySeason = { id: string; seasonNumber: number; status: string; currentPick: number; pickDeadline: string | null; scoringStartsAt: string | null; scoringEndsAt: string | null; completedAt: string | null };
export type FantasySeasonArchive = {
  season: FantasySeason;
  members: FantasyMember[];
  roster: FantasyRosterSlot[];
  standings: Array<{ userId: string; points: number }>;
};
type RawFantasyMember = { user_id: string; display_name: string };
type RawFantasySeason = { id: string; season_number: number; status: string; current_pick: number; pick_deadline: string | null; scoring_starts_at: string | null; scoring_ends_at: string | null; completed_at: string | null };
type RawFantasyRosterSlot = { user_id: string; snack_id: string; snack_name: string; category: string };
type RawFantasyStanding = { user_id: string; points: number };
export type FantasyOverview = {
  league: { id: string; name: string; joinCode: string };
  members: FantasyMember[];
  season: FantasySeason | null;
  draftOrder: Array<{ userId: string; position: number }>;
  picks: Array<{ userId: string; snackId: string; snackName: string; category: string; pickNumber: number; wasAutoPick: boolean }>;
  roster: FantasyRosterSlot[];
  standings: Array<{ userId: string; points: number }>;
  archive: FantasySeasonArchive[];
};

export function fantasyRosterCategory(category: string | undefined): FantasyRosterCategory | null {
  if (category === "Vegetables") return "Vegetable";
  if (category === "Candy/Sweets" || category === "Chips/Savory Snacks") return "Candy/Chips";
  return FANTASY_ROSTER_CATEGORIES.find((candidate) => candidate === category) || null;
}

export function fantasyTeamSlots(roster: FantasyRosterSlot[], userId: string): FantasyTeamSlot[] {
  const mine = roster.filter((slot) => slot.userId === userId);
  return FANTASY_ROSTER_CATEGORIES.map((category) => ({
    category,
    snack: mine.find((slot) => fantasyRosterCategory(slot.category) === category) || null,
  }));
}

export async function getFantasyFeatureState(client: RpcClient): Promise<FantasyFeatureState> {
  const result = await client.rpc("fantasy_feature_state"); if (result.error) throw result.error;
  return result.data as FantasyFeatureState;
}
export async function getMyFantasyLeagues(client: RpcClient): Promise<FantasyLeague[]> {
  const result = await client.rpc("my_fantasy_leagues"); if (result.error) throw result.error;
  return (result.data || []).map((row: { league_id:string; name:string; join_code:string; member_count:number; is_creator:boolean }) => ({ id:row.league_id,name:row.name,joinCode:row.join_code,memberCount:Number(row.member_count),isCreator:row.is_creator }));
}
export async function getFantasyOverview(client: RpcClient, leagueId: string): Promise<FantasyOverview> {
  const result = await client.rpc("fantasy_overview",{p_league_id:leagueId}); if (result.error) throw result.error;
  const raw=result.data;
  const members=(rows: RawFantasyMember[] = [])=>rows.map((x)=>({userId:x.user_id,displayName:x.display_name}));
  const season=(x:RawFantasySeason)=>({id:x.id,seasonNumber:Number(x.season_number),status:x.status,currentPick:Number(x.current_pick),pickDeadline:x.pick_deadline,scoringStartsAt:x.scoring_starts_at,scoringEndsAt:x.scoring_ends_at,completedAt:x.completed_at});
  const roster=(rows: RawFantasyRosterSlot[] = [])=>rows.map((x)=>({userId:x.user_id,snackId:x.snack_id,snackName:x.snack_name,category:x.category}));
  const standings=(rows: RawFantasyStanding[] = [])=>rows.map((x)=>({userId:x.user_id,points:Number(x.points)}));
  return { league:{id:raw.league.id,name:raw.league.name,joinCode:raw.league.join_code}, members:members(raw.members), season:raw.season?season(raw.season):null, draftOrder:(raw.draftOrder||[]).map((x:{user_id:string;position:number})=>({userId:x.user_id,position:Number(x.position)})), picks:(raw.picks||[]).map((x:{user_id:string;snack_id:string;snack_name:string;category:string;pick_number:number;was_auto_pick:boolean})=>({userId:x.user_id,snackId:x.snack_id,snackName:x.snack_name,category:x.category,pickNumber:Number(x.pick_number),wasAutoPick:x.was_auto_pick})), roster:roster(raw.roster), standings:standings(raw.standings), archive:(raw.archive||[]).map((x:{season:RawFantasySeason;members:RawFantasyMember[];roster:RawFantasyRosterSlot[];standings:RawFantasyStanding[]})=>({season:season(x.season),members:members(x.members),roster:roster(x.roster),standings:standings(x.standings)})) };
}
async function rpcVoid(client:RpcClient,name:string,params:Record<string,unknown>){const result=await client.rpc(name,params);if(result.error)throw result.error;return result.data;}
export const createFantasyLeague=(client:RpcClient,name:string)=>rpcVoid(client,"create_fantasy_league",{p_name:name}) as Promise<Array<{league_id:string;join_code:string}>>;
export const joinFantasyLeague=(client:RpcClient,code:string)=>rpcVoid(client,"join_fantasy_league",{p_join_code:code}) as Promise<string>;
export const startFantasyDraft=(client:RpcClient,leagueId:string)=>rpcVoid(client,"start_fantasy_draft",{p_league_id:leagueId}) as Promise<string>;
export const submitFantasyPick=(client:RpcClient,seasonId:string,snackId:string)=>rpcVoid(client,"submit_fantasy_pick",{p_season_id:seasonId,p_snack_id:snackId}) as Promise<void>;
export const setFantasyPreferences=(client:RpcClient,seasonId:string,snackIds:string[])=>rpcVoid(client,"set_fantasy_preferences",{p_season_id:seasonId,p_snack_ids:snackIds}) as Promise<void>;
