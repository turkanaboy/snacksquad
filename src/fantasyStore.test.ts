import assert from "node:assert/strict";
import { fantasyRosterCategory,fantasyTeamSlots,getFantasyFeatureState,getMyFantasyLeagues,getFantasyOverview,joinFantasyLeague,startFantasyDraft } from "./fantasyStore";
const calls:Array<{name:string;params?:unknown}>=[];
const client={rpc:async(name:string,params?:unknown)=>{calls.push({name,params});if(name==="fantasy_feature_state")return{data:{enabled:false,weeksObserved:1,dailyActiveUsers:2,fullBracketParticipation:false,weeklyUserGrowth:true,averageLogsPerUserWeek:2.5},error:null};if(name==="my_fantasy_leagues")return{data:[{league_id:"l1",name:"Crunch Club",join_code:"abc",member_count:4,is_creator:true}],error:null};if(name==="fantasy_overview")return{data:{league:{id:"l1",name:"Crunch Club",join_code:"abc"},members:[],season:{id:"s1",season_number:2,status:"active",current_pick:21,pick_deadline:null,scoring_starts_at:"2026-07-13T04:00:00Z",scoring_ends_at:"2026-07-25T04:00:00Z",completed_at:null},draftOrder:[],picks:[],roster:[],standings:[]},error:null};return{data:"l1",error:null};}};
assert.equal((await getFantasyFeatureState(client as never)).enabled,false);
assert.equal((await getMyFantasyLeagues(client as never))[0].memberCount,4);
const overview=await getFantasyOverview(client as never,"l1");
assert.equal(overview.league.name,"Crunch Club");
assert.equal(overview.season?.seasonNumber,2);
assert.equal(overview.season?.scoringStartsAt,"2026-07-13T04:00:00Z");
assert.equal(await joinFantasyLeague(client as never,"abc"),"l1");
await startFantasyDraft(client as never,"l1");
assert.deepEqual(calls.at(-1),{name:"start_fantasy_draft",params:{p_league_id:"l1"}});
assert.equal(calls.length,5);
assert.equal(fantasyRosterCategory("Vegetables"),"Vegetable");
assert.equal(fantasyRosterCategory("Candy/Sweets"),"Candy/Chips");
assert.equal(fantasyRosterCategory("Chips/Savory Snacks"),"Candy/Chips");
assert.equal(fantasyRosterCategory("Dairy"),null);
assert.deepEqual(fantasyTeamSlots([
  { userId:"u1", snackId:"apple", snackName:"Apple", category:"Fruit" },
  { userId:"u1", snackId:"chips", snackName:"Chips", category:"Chips/Savory Snacks" },
],"u1"),[
  { category:"Grains/Bakery", snack:null },
  { category:"Fruit", snack:{ userId:"u1", snackId:"apple", snackName:"Apple", category:"Fruit" } },
  { category:"Vegetable", snack:null },
  { category:"Candy/Chips", snack:{ userId:"u1", snackId:"chips", snackName:"Chips", category:"Chips/Savory Snacks" } },
  { category:"Protein", snack:null },
]);
console.log("fantasy store tests passed");
