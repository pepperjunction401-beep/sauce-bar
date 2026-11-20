// Pepper Junction Badge Command Center: read-only owner telemetry.
// Separate from the award engine and from the protected Loyalty Bridge.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.83.0";
const OWNER_EMAIL="john@pepperjunction401.com";
const headers={"access-control-allow-origin":"*","access-control-allow-headers":"authorization,apikey,content-type,x-client-info","access-control-allow-methods":"POST,OPTIONS","cache-control":"no-store","content-type":"application/json"};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
function secretKey():string|undefined{try{const o=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");return typeof o.default==="string"?o.default:undefined;}catch{return undefined;}}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST")return reply({error:"METHOD_NOT_ALLOWED"},405);
 const url=Deno.env.get("SUPABASE_URL"),secret=secretKey(),ownerId=Deno.env.get("PJ_REVIEW_OWNER_USER_ID");
 if(!url||!secret||!ownerId)return reply({error:"OWNER_NOT_CONFIGURED"},503);
 const token=(req.headers.get("authorization")||"").replace(/^Bearer /i,"").trim();
 if(!token)return reply({error:"SIGN_IN_REQUIRED"},401);
 const admin=createClient(url,secret,{auth:{persistSession:false}});
 const {data:identity,error:authError}=await admin.auth.getUser(token);
 const user=identity?.user;
 if(authError||!user||!user.email_confirmed_at)return reply({error:"SIGN_IN_REQUIRED"},401);
 if(user.id!==ownerId||String(user.email||"").toLowerCase()!==OWNER_EMAIL)return reply({error:"FORBIDDEN"},403);
 const body=await req.json().catch(()=>null);
 if(!body||body.action!=="snapshot")return reply({error:"UNKNOWN_ACTION"},400);
 // All sources are existing badge-engine tables. Never award or modify anything.
 const jobs=await Promise.all([
   admin.from("pj_customer_badge_awards").select("badge_code,customer_id,earned_at,award_state,reversed_at").eq("award_state","earned").is("reversed_at",null).order("earned_at",{ascending:false}).limit(1000),
   admin.from("pj_celestial_awards").select("customer_id,edition_year,month_number,earned_at").order("earned_at",{ascending:false}).limit(1000),
   admin.from("pj_passenger_token_awards").select("customer_id,token_code,earned_at").order("earned_at",{ascending:false}).limit(1000),
   admin.from("pj_badge_definitions").select("badge_code,badge_family").eq("is_active",true)
 ]);
 if(jobs.some(j=>j.error))return reply({error:"BADGE_SOURCE_UNAVAILABLE"},503);
 const core=jobs[0].data||[],celestial=jobs[1].data||[],railroad=jobs[2].data||[];
 const defs=new Map((jobs[3].data||[]).map(x=>[x.badge_code,x.badge_family]));
 const recent=[
  ...core.map(x=>({family:defs.get(x.badge_code)||"Core",code:x.badge_code,earnedAt:x.earned_at,customerId:x.customer_id})),
  ...celestial.map(x=>({family:"Celestial",code:String(x.edition_year)+" / month "+String(x.month_number),earnedAt:x.earned_at,customerId:x.customer_id})),
  ...railroad.map(x=>({family:"Railroad Passenger Tokens",code:x.token_code,earnedAt:x.earned_at,customerId:x.customer_id}))
 ].sort((a,b)=>String(b.earnedAt).localeCompare(String(a.earnedAt))).slice(0,15);
 return reply({ok:true,asOf:new Date().toISOString(),
  sources:[{label:"Core Badge Awards",count:core.length,limited:core.length===1000},
           {label:"Celestial Awards",count:celestial.length,limited:celestial.length===1000},
           {label:"Railroad Tokens",count:railroad.length,limited:railroad.length===1000}],
  uniqueCustomers:new Set([...core,...celestial,...railroad].map(x=>x.customer_id)).size,
  recent,
  note:"Read-only snapshot of three existing badge award sources; excludes Loyalty Bridge and other families."
 });
});