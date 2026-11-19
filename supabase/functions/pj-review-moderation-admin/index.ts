// Pepper Junction private owner moderation API — Testing/Dev until separately promoted.
// Only a configured owner UUID AND verified owner email may read or decide cases.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.83.0";
const OWNER_EMAIL="john@pepperjunction401.com";
const cors={
 "access-control-allow-origin":"*",
 "access-control-allow-headers":"authorization,apikey,content-type,x-client-info",
 "access-control-allow-methods":"POST, OPTIONS",
 "cache-control":"no-store",
 "content-type":"application/json"
};
function reply(body:unknown,status=200){
 return new Response(JSON.stringify(body),{status,headers:cors});
}
function secretKey():string|undefined{
 try{const m=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");return typeof m.default==="string"?m.default:undefined;}
 catch{return undefined;}
}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return reply({error:"METHOD_NOT_ALLOWED"},405);
 const url=Deno.env.get("SUPABASE_URL"),key=secretKey();
 const ownerId=Deno.env.get("PJ_REVIEW_OWNER_USER_ID");
 // No owner claim can come from client-controlled metadata or caller-supplied IDs.
 if(!ownerId||!url||!key)return reply({error:"OWNER_MODERATION_NOT_CONFIGURED"},503);
 const token=(req.headers.get("authorization")||"").replace(/^Bearer /i,"").trim();
 if(!token)return reply({error:"SIGN_IN_REQUIRED"},401);
 const admin=createClient(url,key,{auth:{persistSession:false}});
 const {data,error:authError}=await admin.auth.getUser(token);
 const owner=data?.user;
 if(authError||!owner||!owner.email_confirmed_at)return reply({error:"SIGN_IN_REQUIRED"},401);
 if(owner.id!==ownerId||String(owner.email||"").toLowerCase()!==OWNER_EMAIL)return reply({error:"FORBIDDEN"},403);
 const payload=await req.json().catch(()=>null);
 if(!payload||typeof payload!=="object")return reply({error:"BAD_REQUEST"},400);
 if(payload.action==="queue"){
  const {data:cases,error:caseError}=await admin.from("pj_review_moderation_cases")
   .select("review_id,reason,created_at,notification_sent_at,last_notification_error")
   .order("created_at",{ascending:true}).limit(100);
  if(caseError)return reply({error:"QUEUE_UNAVAILABLE"},503);
  if(!cases?.length)return reply({cases:[]});
  const {data:reviews,error:reviewError}=await admin.from("pj_review_submissions")
   .select("id,product_slug_snapshot,q14_original,q15_original,moderation_status,submitted_at")
   .in("id",cases.map(c=>c.review_id));
  if(reviewError)return reply({error:"QUEUE_UNAVAILABLE"},503);
  const reviewById=new Map((reviews||[]).map(r=>[r.id,r]));
  return reply({cases:cases.flatMap(c=>{
   const r=reviewById.get(c.review_id);
   if(!r||r.moderation_status!=="frozen")return [];
   return [{
    id:c.review_id,productSlug:r.product_slug_snapshot,
    submittedAt:r.submitted_at,reason:c.reason,
    privateFoodUse:r.q14_original,publicReviewCandidate:r.q15_original,
    notified:!!c.notification_sent_at,
    notificationError:c.last_notification_error
   }];
  })});
 }
 if(payload.action==="decide"){
  const reviewId=payload.reviewId,decision=payload.decision;
  if(typeof reviewId!=="string"||!/^[a-f0-9-]{36}$/i.test(reviewId)||
     !["approved","rejected"].includes(decision))return reply({error:"INVALID_DECISION"},400);
  const {data:changed,error}=await admin.rpc("pj_review_owner_moderation_decision",{
   p_review_id:reviewId,p_owner_id:owner.id,p_decision:decision
  });
  if(error)return reply({error:"DECISION_FAILED"},503);
  if(changed!==true)return reply({error:"CASE_ALREADY_RESOLVED"},409);
  return reply({ok:true,decision});
 }
 return reply({error:"UNKNOWN_ACTION"},400);
});
