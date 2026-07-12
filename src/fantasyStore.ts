import type { SupabaseClient } from "@supabase/supabase-js";

type RpcClient = Pick<SupabaseClient, "rpc">;
export type FantasyFeatureState = { enabled: boolean; weeksObserved: number; dailyActiveUsers: number; fullBracketParticipation: boolean; weeklyUserGrowth: boolean; averageLogsPerUserWeek: number };
export type FantasyLeague = { id: string; name: string; joinCode: string; memberCount: number; isCreator: boolean };
export type FantasyOverview = {
  league: { id: string; name: string; joinCode: string };
  members: Array<{ userId: string; displayName: string }>;
  season: null | { id: string; seasonNumber: number; status: string; currentPick: number; pickDeadline: string | null; scoringStartsAt: string | null; scoringEndsAt: string | null; completedAt: string | null };
  draftOrder: Array<{ userId: string; position: number }>;
  picks: Array<{ userId: string; snackId: string; snackName: string; category: string; pickNumber: number; wasAutoPick: boolean }>;
  roster: Array<{ userId: string; snackId: string; snackName: string; category: string }>;
  standings: Array<{ userId: string; points: number }>;
};

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
  return { league:{id:raw.league.id,name:raw.league.name,joinCode:raw.league.join_code}, members:(raw.members||[]).map((x:{user_id:string;display_name:string})=>({userId:x.user_id,displayName:x.display_name})), season:raw.season?{id:raw.season.id,seasonNumber:Number(raw.season.season_number),status:raw.season.status,currentPick:Number(raw.season.current_pick),pickDeadline:raw.season.pick_deadline,scoringStartsAt:raw.season.scoring_starts_at,scoringEndsAt:raw.season.scoring_ends_at,completedAt:raw.season.completed_at}:null, draftOrder:(raw.draftOrder||[]).map((x:{user_id:string;position:number})=>({userId:x.user_id,position:Number(x.position)})), picks:(raw.picks||[]).map((x:{user_id:string;snack_id:string;snack_name:string;category:string;pick_number:number;was_auto_pick:boolean})=>({userId:x.user_id,snackId:x.snack_id,snackName:x.snack_name,category:x.category,pickNumber:Number(x.pick_number),wasAutoPick:x.was_auto_pick})), roster:(raw.roster||[]).map((x:{user_id:string;snack_id:string;snack_name:string;category:string})=>({userId:x.user_id,snackId:x.snack_id,snackName:x.snack_name,category:x.category})), standings:(raw.standings||[]).map((x:{user_id:string;points:number})=>({userId:x.user_id,points:Number(x.points)})) };
}
async function rpcVoid(client:RpcClient,name:string,params:Record<string,unknown>){const result=await client.rpc(name,params);if(result.error)throw result.error;return result.data;}
export const createFantasyLeague=(client:RpcClient,name:string)=>rpcVoid(client,"create_fantasy_league",{p_name:name}) as Promise<Array<{league_id:string;join_code:string}>>;
export const joinFantasyLeague=(client:RpcClient,code:string)=>rpcVoid(client,"join_fantasy_league",{p_join_code:code}) as Promise<string>;
export const startFantasyDraft=(client:RpcClient,leagueId:string)=>rpcVoid(client,"start_fantasy_draft",{p_league_id:leagueId}) as Promise<string>;
export const submitFantasyPick=(client:RpcClient,seasonId:string,snackId:string)=>rpcVoid(client,"submit_fantasy_pick",{p_season_id:seasonId,p_snack_id:snackId}) as Promise<void>;
export const setFantasyPreferences=(client:RpcClient,seasonId:string,snackIds:string[])=>rpcVoid(client,"set_fantasy_preferences",{p_season_id:seasonId,p_snack_ids:snackIds}) as Promise<void>;
