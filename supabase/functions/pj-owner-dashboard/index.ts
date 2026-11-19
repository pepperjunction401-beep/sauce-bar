// Pepper Junction owner dashboard — read-only, Dev/Testing first.
// Access requires verified owner JWT plus an exact owner UUID stored as server secret.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.83.0";
const OWNER_EMAIL="john@pepperjunction401.com";
const cors={"access-control-allow-origin":"*","access-control-allow-headers":"authorization,apikey,content-type,x-client-info","access-control-allow-methods":"POST,OPTIONS","cache-control":"no-store","content-type":"application/json"};
function reply(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:cors});}
function key():string|undefined{try{const obj=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");return typeof obj.default==="string"?obj.default:undefined;}catch{return undefined;}}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return reply({error:"METHOD_NOT_ALLOWED"},405);
 const url=Deno.env.get("SUPABASE_URL"),secret=key();
 // Production owner UUID was independently verified against auth.users on 19 Nov 2026.
 // The UUID is an identity selector, not an authentication secret. The JWT and
 // confirmed email are still independently validated by Supabase Auth.
 const isProduction=!!url&&url.includes("cdbenwthxhypuuipyjlv.supabase.co");
 const isTesting=!!url&&url.includes("slubpfmpjgoupujptayy.supabase.co");
 const ownerId=isProduction
  ? "60e36cd4-50aa-452e-b1cc-f3060ac32952"
  : isTesting ? Deno.env.get("PJ_REVIEW_OWNER_USER_ID") : undefined;
 if(!url||!secret||!ownerId)return reply({error:"OWNER_DASHBOARD_NOT_CONFIGURED"},503);
 const token=(req.headers.get("authorization")||"").replace(/^Bearer /i,"").trim();
 if(!token)return reply({error:"SIGN_IN_REQUIRED"},401);
 const admin=createClient(url,secret,{auth:{persistSession:false}});
 const {data:identity,error:authError}=await admin.auth.getUser(token);
 const owner=identity?.user;
 if(authError||!owner||!owner.email_confirmed_at)return reply({error:"SIGN_IN_REQUIRED"},401);
 if(owner.id!==ownerId||String(owner.email||"").toLowerCase()!==OWNER_EMAIL)return reply({error:"FORBIDDEN"},403);
 const payload=await req.json().catch(()=>null);
 if(!payload||typeof payload!=="object"||payload.action!=="summary")return reply({error:"UNKNOWN_ACTION"},400);
 // Read Auth admin API only after strict owner authorization. No SQL views or public grants.
 const users:{id:string;email?:string;created_at:string;email_confirmed_at?:string|null;deleted_at?:string|null;is_anonymous?:boolean}[]=[];
 let complete=false;
 for(let page=1;page<=10;page++){
  const {data,error}=await admin.auth.admin.listUsers({page,perPage:1000});
  if(error||!data)return reply({error:"ACCOUNT_SOURCE_UNAVAILABLE"},503);
  users.push(...data.users);
  if(!data.nextPage){complete=true;break;}
 }
 const active=users.filter(u=>!u.deleted_at&&!u.is_anonymous)
  .sort((a,b)=>b.created_at.localeCompare(a.created_at));
 const {count:flagged,error:flagError}=await admin.from("pj_review_submissions")
  .select("id",{head:true,count:"exact"}).eq("moderation_status","frozen");
 if(flagError)return reply({error:"REVIEW_QUEUE_UNAVAILABLE"},503);
 return reply({ok:true,source:"Supabase Auth",complete,registeredCount:active.length,
  verifiedCount:active.filter(u=>!!u.email_confirmed_at).length,
  recent:active.slice(0,20).map(u=>({createdAt:u.created_at,verified:!!u.email_confirmed_at,email:u.email||""})),
  flaggedCount:flagged??0,asOf:new Date().toISOString()});
});