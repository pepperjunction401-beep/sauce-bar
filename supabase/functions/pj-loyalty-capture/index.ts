import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.83.0";
import {captureStep,STREAMS} from "../_shared/loyalty-capture-core.mjs";
const PRODUCTION="https://cdbenwthxhypuuipyjlv.supabase.co";
const TESTING="https://slubpfmpjgoupujptayy.supabase.co";
const OWNER_EMAIL="john@pepperjunction401.com";
const PRODUCTION_OWNER="60e36cd4-50aa-452e-b1cc-f3060ac32952";
function secret(){
 try{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||Deno.env.get("SUPABASE_SECRET_KEY")||
 JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default;}catch{return null;}
}
async function digest(value){
 const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));
 return Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");
}
Deno.serve(async req=>{
 const url=Deno.env.get("SUPABASE_URL"),prod=url===PRODUCTION,test=url===TESTING;
 const origin=req.headers.get("Origin")||"";
 const allowed=!origin||(prod&&["https://pepperjunction401.com","https://www.pepperjunction401.com"].includes(origin))||
 (test&&/^http:\/\/(localhost|127\.0\.0\.1):(8000|8080)$/.test(origin));
 const headers={"Content-Type":"application/json","Cache-Control":"no-store","Vary":"Origin",
 "Access-Control-Allow-Origin":allowed?origin:"","Access-Control-Allow-Methods":"POST, OPTIONS",
 "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info"};
 const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(!allowed)return reply({error:"ORIGIN_FORBIDDEN"},403);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST")return reply({error:"METHOD_NOT_ALLOWED"},405);
 if(!prod&&!test)return reply({error:"ENVIRONMENT_FORBIDDEN"},503);
 const key=secret(),ownerId=prod?PRODUCTION_OWNER:Deno.env.get("PJ_REVIEW_OWNER_USER_ID");
 const match=(req.headers.get("Authorization")||"").match(/^Bearer (\S+)$/i);
 if(!key||!ownerId)return reply({error:"CAPTURE_NOT_CONFIGURED"},503);
 if(!match)return reply({error:"SIGN_IN_REQUIRED"},401);
 const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:identity,error:authError}=await admin.auth.getUser(match[1]);
 const owner=identity?.user;
 if(authError||!owner||!owner.email_confirmed_at)return reply({error:"SIGN_IN_REQUIRED"},401);
 if(owner.id!==ownerId||String(owner.email||"").toLowerCase()!==OWNER_EMAIL)return reply({error:"FORBIDDEN"},403);
 const body=await req.json().catch(()=>null);
 if(!body||Object.keys(body).length!==1||!["status","capture","stage"].includes(body.action))return reply({error:"INVALID_ACTION"},400);
 const read=async promise=>{const {data,error}=await promise;if(error)throw Error("CAPTURE_DATABASE_UNAVAILABLE");return data;};
 const db={
 enabled:async()=>!!(await read(admin.from("pj_loyalty_capture_control").select("capture_enabled").eq("singleton",true).single())).capture_enabled,
 getRun:async()=>await read(admin.from("pj_loyalty_capture_runs").select("id,state,source_program_id,api_version,snapshot_id").maybeSingle()),
 createRun:async(program,version)=>await read(admin.from("pj_loyalty_capture_runs").insert({source_program_id:program,api_version:version}).select("id,state,source_program_id,api_version,snapshot_id").single()),
 lastPage:async(id,stream)=>await read(admin.from("pj_loyalty_capture_pages").select("page_number,next_cursor").eq("run_id",id).eq("stream",stream).order("page_number",{ascending:false}).limit(1).maybeSingle()),
 append:async(id,stream,cursor,page,hash)=>await read(admin.rpc("pj_loyalty_capture_append_page",{p_run:id,p_stream:stream,p_requested_cursor:cursor,p_response:page,p_sha256:hash}))
 };
 async function status(){
  const enabled=await db.enabled(),run=await db.getRun(),streams={};
  if(run)for(const [stream] of STREAMS){
   const last=await db.lastPage(run.id,stream);
   streams[stream]={pages:last?.page_number??0,complete:!!last&&last.next_cursor===null};
  }
  return {enabled,state:run?.state??"not_started",streams,snapshot_id:run?.snapshot_id??null,credits_transferred:0};
 }
 try{
  if(body.action==="status")return reply(await status());
  if(!await db.enabled())return reply({error:"CAPTURE_DISABLED"},423);
  if(body.action==="stage"){
   const run=await db.getRun();
   if(!run)return reply({error:"CAPTURE_NOT_STARTED"},409);
   const staged=await read(admin.rpc("pj_loyalty_capture_stage_register",{p_run:run.id}));
   return reply(staged,["staged","already_staged"].includes(staged?.status)?200:409);
  }
  const token=Deno.env.get(prod?"SQUARE_PRODUCTION_ACCESS_TOKEN":"SQUARE_SANDBOX_ACCESS_TOKEN");
  if(!token)return reply({error:"SQUARE_CREDENTIAL_UNAVAILABLE"},503);
  const result=await captureStep({db,fetcher:fetch,base:prod?"https://connect.squareup.com":"https://connect.squareupsandbox.com",
   token,digest,deadline:Date.now()+20000,maxPages:6});
  return reply({...await status(),pages_added:result.pagesAdded});
 }catch(error){
  const codes=/^(CAPTURE_(RESUME_REQUIRED|DISABLED|PROGRAM_MISMATCH|DATABASE_UNAVAILABLE)|SQUARE_(ENDPOINT_NOT_ALLOWED|NETWORK_UNAVAILABLE|TEMPORARILY_UNAVAILABLE|HTTP_[0-9]{3}|INVALID_RESPONSE|INVALID_PAGE|LOYALTY_NOT_ACTIVE))$/;
  return reply({error:error instanceof Error&&codes.test(error.message)?error.message:"CAPTURE_STOPPED",resumable:true},503);
 }
});
