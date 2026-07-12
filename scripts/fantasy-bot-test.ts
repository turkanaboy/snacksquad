import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";

export const botEmail = (runId: string, position: number) => `fantasy-bot-${runId.slice(0,8)}-${position}@snacksquad.test`;
export function cleanupConfirmed(runId: string, args: string[]) {
  return args.includes("--execute") && args[args.indexOf("--confirm")+1] === runId;
}
export function validateTarget(args:string[],url:string){
  const local=/localhost|127[.]0[.]0[.]1/.test(url);
  if(args.includes("--local")&&!local)throw new Error("--local requires a local Supabase URL.");
  if(args.includes("--live")&&local)throw new Error("--live refuses a local Supabase URL.");
}

const required = (name: string) => {
  const value=process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};
const service = () => createClient(required("SUPABASE_URL"),required("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
const userClient = () => createClient(required("SUPABASE_URL"),required("SUPABASE_ANON_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
async function rpc<T>(client:SupabaseClient,name:string,params:Record<string,unknown>={}) {
  const result=await client.rpc(name,params); if(result.error) throw result.error; return result.data as T;
}

async function invokeSender() {
  const key=required("SUPABASE_SERVICE_ROLE_KEY");
  const response=await fetch(`${required("SUPABASE_URL")}/functions/v1/fantasy-notifications`,{method:"POST",headers:{Authorization:`Bearer ${key}`}});
  if(!response.ok) throw new Error(`Notification sender returned HTTP ${response.status}.`);
  return response.json();
}

async function run(args:string[]) {
  validateTarget(args,required("SUPABASE_URL"));
  const admin=service();
  const label=`fantasy-${new Date().toISOString().replace(/[^0-9]/g,"").slice(0,14)}`;
  const runId=await rpc<string>(admin,"create_fantasy_test_run",{p_label:label});
  console.log(`Created Fantasy test run ${runId}`);
  const bots:Array<{id:string;client:SupabaseClient}>=[];
  const createdIds:string[]=[];
  try {
    for(let position=1;position<=4;position++){
      const password=`Bot-${crypto.randomUUID()}!`;
      const created=await admin.auth.admin.createUser({email:botEmail(runId,position),password,email_confirm:true,app_metadata:{snack_squad_test_bot:true,fantasy_test_run_id:runId}});
      if(created.error||!created.data.user) throw created.error??new Error("Bot user creation failed.");
      createdIds.push(created.data.user.id);
      await rpc(admin,"register_fantasy_test_actor",{p_run_id:runId,p_user_id:created.data.user.id});
      const client=userClient();
      const signedIn=await client.auth.signInWithPassword({email:botEmail(runId,position),password});
      if(signedIn.error) throw signedIn.error;
      bots.push({id:created.data.user.id,client});
    }
  } catch(error) {
    for(const userId of createdIds) await admin.auth.admin.deleteUser(userId);
    await rpc(admin,"abort_fantasy_test_run",{p_run_id:runId});
    throw error;
  }

  const created=await rpc<Array<{league_id:string;join_code:string}>>(bots[0].client,"create_fantasy_league",{p_name:"Bot Crunch League"});
  const {league_id:leagueId,join_code:joinCode}=created[0];
  for(const bot of bots.slice(1)) await rpc(bot.client,"join_fantasy_league",{p_join_code:joinCode});
  await rpc(admin,"link_fantasy_test_league",{p_run_id:runId,p_league_id:leagueId});
  await rpc(bots[0].client,"start_fantasy_draft",{p_league_id:leagueId});
  await invokeSender();

  let overview=await rpc<any>(bots[0].client,"fantasy_overview",{p_league_id:leagueId});
  let pickerId=overview.draftOrder.find((entry:any)=>entry.position===1).user_id as string;
  let snackId=await rpc<string>(admin,"prepare_fantasy_test_snack",{p_run_id:runId,p_user_id:pickerId});
  await rpc(bots.find(bot=>bot.id===pickerId)!.client,"submit_fantasy_pick",{p_season_id:overview.season.id,p_snack_id:snackId});

  overview=await rpc<any>(bots[0].client,"fantasy_overview",{p_league_id:leagueId});
  pickerId=publicCurrentPicker(overview);
  snackId=await rpc<string>(admin,"prepare_fantasy_test_snack",{p_run_id:runId,p_user_id:pickerId});
  await rpc(bots.find(bot=>bot.id===pickerId)!.client,"set_fantasy_preferences",{p_season_id:overview.season.id,p_snack_ids:[snackId]});
  await new Promise(resolve=>setTimeout(resolve,61_000));
  await invokeSender();
  await rpc(admin,"advance_fantasy_test_draft",{p_run_id:runId,p_count:40});

  overview=await rpc<any>(bots[0].client,"fantasy_overview",{p_league_id:leagueId});
  const scoringAt=new Date(new Date(overview.season.scoring_starts_at).getTime()+1_000).toISOString();
  for(let i=0;i<bots.length;i++){
    const targetOwner=bots[(i+1)%bots.length].id;
    const target=overview.roster.find((slot:any)=>slot.user_id===targetOwner);
    const inserted=await bots[i].client.from("snack_logs").insert({user_id:bots[i].id,snack_id:target.snack_id,logged_at:scoringAt}).select("id").single();
    if(inserted.error) throw inserted.error;
  }
  await rpc(admin,"complete_fantasy_test_run",{p_run_id:runId});
  console.log(JSON.stringify(await rpc(admin,"inspect_fantasy_test_run",{p_run_id:runId}),null,2));
}

function publicCurrentPicker(overview:any) {
  const count=overview.draftOrder.length, pick=Number(overview.season.current_pick), round=Math.floor((pick-1)/count)+1, within=(pick-1)%count+1;
  const position=round%2===1?within:count-within+1;
  return overview.draftOrder.find((entry:any)=>Number(entry.position)===position).user_id as string;
}

async function inspect(runId:string){console.log(JSON.stringify(await rpc(service(),"inspect_fantasy_test_run",{p_run_id:runId}),null,2));}
async function cleanup(runId:string,args:string[]){
  const admin=service();
  const targets=await rpc<Array<{user_id:string}>>(admin,"fantasy_test_cleanup_targets",{p_run_id:runId});
  console.log(JSON.stringify({runId,userIds:targets.map(target=>target.user_id),execute:cleanupConfirmed(runId,args)},null,2));
  if(!cleanupConfirmed(runId,args)) return;
  await rpc(admin,"purge_fantasy_test_data",{p_run_id:runId});
  for(const target of targets){const deleted=await admin.auth.admin.deleteUser(target.user_id);if(deleted.error)throw deleted.error;}
  await rpc(admin,"finalize_fantasy_test_cleanup",{p_run_id:runId});
}

async function main(){const [command,...args]=process.argv.slice(2);if(command==="run")return run(args);if(command==="inspect"&&args[0])return inspect(args[0]);if(command==="cleanup"&&args[0])return cleanup(args[0],args.slice(1));throw new Error("Use run [--local|--live], inspect <run-id>, or cleanup <run-id> [--execute --confirm <run-id>].");}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error);process.exitCode=1;});
