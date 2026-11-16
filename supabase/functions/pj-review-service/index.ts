// Pepper Junction — original Passenger Review service.
// Receives browser JWTs; Supabase service credentials never leave the server.
// Dev project reads Sauce-Bar-Dev CNS, production reads deployed first-party CNS.
// No badge evaluation, Square matching, import, or public-review publication here.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.83.0";

const DEV_PROJECT="slubpfmpjgoupujptayy";
const DEV_CNS="https://raw.githubusercontent.com/pepperjunction401-beep/sauce-bar/Sauce-Bar-Dev/data/Database_Pepper_Junction.json";
const LIVE_CNS="https://pepperjunction401.com/data/Database_Pepper_Junction.json";
const HEAT=["Mild","Medium","Hot","Very Hot","Super Hot","Extreme","Inferno"];
const SCORING=[
  ["Flavor/heat duo favors out of the bottle, hands down.","Flavor/heat duo favors out of the bottle by an edge.","Flavor/heat duo is balanced."],
  ["Flavor beats the heat.","Heat beats the flavor.","Thelma and Louise — they end together."],
  ["They didn't lie.","Like my girlfriend's expectation of me, it fell way short.","It brought the heat like Tony Soprano."],
  ["Bright, like staring at the sun.","Like my dad used to say: not too bright, good kid though.","Like a great living-room lamp, it's just right."],
  ["Did I put hot sauce on this?","They played well together.","Like Mike Tyson, the sauce was overpowering."],
  ["Did I put hot sauce on this?","They played well together.","Like Mike Tyson, the heat was overpowering."]
];
const FAVORITE=[2,2,0,2,1,1];
const LANE=[
 "Yes — this was right where I like it.",
 "A little hotter than my usual lane, but manageable.",
 "No — this was hotter than I normally enjoy.",
 "No — this was milder than I normally enjoy."
];
const cors={
 "access-control-allow-origin":"*",
 "access-control-allow-headers":"authorization,apikey,content-type,x-client-info",
 "access-control-allow-methods":"POST, OPTIONS",
 "cache-control":"no-store"
};
function reply(body:unknown,status=200){
 return new Response(JSON.stringify(body),{status,headers:{...cors,"content-type":"application/json"}});
}
function secretKey():string|undefined{
 try {
  const json=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");
  return typeof json.default==="string"?json.default:undefined;
 }catch{return undefined;}
}
function uniqueColumn(records:Record<string,unknown>[],column:string):string[]{
 return [...new Set(records.map(x=>x[column]).filter((x):x is string=>typeof x==="string"&&!!x.trim()))];
}
function validAnswers(a:Record<string,unknown>,p:Record<string,unknown>,catalog:Record<string,unknown>[]){
 let points=0;
 for(let i=0;i<6;i++){
  const chosen=a["q"+(i+1)];
  if(typeof chosen!=="string"||!SCORING[i].includes(chosen))return null;
  points+=chosen===SCORING[i][FAVORITE[i]]?2:1;
 }
 const heatCategory=p["Heat Category"];
 const hi=HEAT.indexOf(typeof heatCategory==="string"?heatCategory:"");
 const heatOptions=hi<0?[]:HEAT.slice(Math.max(0,hi-1),Math.min(7,hi+2));
 if(!heatOptions.includes(a.q7 as string))return null;
 if(!["Yes","No"].includes(a.q8 as string)||!["Yes","No"].includes(a.q9 as string))return null;
 if(!uniqueColumn(catalog,"Food Style").includes(a.q10 as string))return null;
 // Q11 is its own approved CNS field; descriptive Primary Flavor Notes are NOT options.
 const options=p["Review Flavor Options"];
 const flavors=Array.isArray(options)?options.filter((s):s is string=>typeof s==="string"&&!!s.trim()):[];
 if(flavors.length===0)return null;
 if(!Array.isArray(a.q11)||a.q11.length<1||a.q11.length>3||
   new Set(a.q11).size!==a.q11.length||!a.q11.every(s=>flavors.includes(s)))return null;
 if(!uniqueColumn(catalog,"How it Hits").includes(a.q12 as string)||
    !uniqueColumn(catalog,"Heat Finish").includes(a.q13 as string))return null;
 if(!LANE.includes(a.q16 as string)||!Number.isInteger(a.q17)||Number(a.q17)<1||Number(a.q17)>5)return null;
 for(const k of ["q14","q15"]){
  if(typeof a[k]!=="string"||!(a[k] as string).trim()||(a[k] as string).length>200)return null;
 }
 return points;
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return reply({error:"METHOD_NOT_ALLOWED"},405);
 const url=Deno.env.get("SUPABASE_URL")||"";
 const key=secretKey();
 const token=(req.headers.get("authorization")||"").replace(/^Bearer /i,"").trim();
 if(!url||!key)return reply({error:"SERVICE_UNAVAILABLE"},503);
 if(!token)return reply({error:"SIGN_IN_REQUIRED"},401);
 const admin=createClient(url,key,{auth:{persistSession:false}});
 const {data:userResult,error:authError}=await admin.auth.getUser(token);
 const user=userResult?.user;
 if(authError||!user||!user.email_confirmed_at)return reply({error:"SIGN_IN_REQUIRED"},401);
 const request=await req.json().catch(()=>null);
 if(!request||typeof request!=="object")return reply({error:"INVALID_REQUEST"},400);
 const action=request.action;
 const slug=typeof request.slug==="string"?request.slug:typeof request.productSlug==="string"?request.productSlug:"";
 if(!slug||slug.length>180||!/^[a-z0-9][a-z0-9-]*$/.test(slug))return reply({error:"INVALID_PRODUCT"},400);
 if(action==="rating-read"){
  const {data,error}=await admin.from("pj_review_personal_ratings").select("rating")
   .eq("customer_id",user.id).eq("product_slug",slug).maybeSingle();
  if(error)return reply({error:"RATING_UNAVAILABLE"},503);
  return reply({rating:data?.rating??null});
 }
 if(action==="rating-save"){
  const value=Number(request.value);
  if(!Number.isFinite(value)||value<1||value>5||Math.round(value*4)!==value*4)return reply({error:"INVALID_RATING"},400);
  const {error}=await admin.from("pj_review_personal_ratings").upsert({
   customer_id:user.id,product_slug:slug,rating:value,updated_at:new Date().toISOString()
  },{onConflict:"customer_id,product_slug"});
  return error?reply({error:"RATING_UNAVAILABLE"},503):reply({ok:true});
 }
 if(action!=="status"&&action!=="submit")return reply({error:"UNKNOWN_ACTION"},400);
 const {data:eligibility,error:eligibilityError}=await admin.rpc("pj_review_status_for_customer",{
  p_customer_id:user.id,p_slug:slug
 });
 if(eligibilityError)return reply({error:"ELIGIBILITY_UNAVAILABLE"},503);
 if(action==="status"){
  const {data:profile}=await admin.from("customer_profiles").select("display_name").eq("id",user.id).maybeSingle();
  const displayName=String(profile?.display_name||"").trim().split(/\s+/)[0];
  return reply({signedIn:true,eligible:eligibility.eligible,alreadyReviewed:eligibility.alreadyReviewed,
   reason:eligibility.reason??null,firstName:displayName||"Passenger",passengerClass:null});
 }
 if(eligibility.alreadyReviewed)return reply({error:"ALREADY_REVIEWED"},409);
 if(!eligibility.eligible)return reply({error:"NOT_ELIGIBLE"},403);
 const source=url.includes(DEV_PROJECT)?DEV_CNS:LIVE_CNS;
 let catalog:Record<string,unknown>[]=[];
 try{
  const response=await fetch(source,{cache:"no-store"});
  if(!response.ok)throw new Error("CNS");
  const rows=await response.json();
  if(!Array.isArray(rows))throw new Error("CNS format");
  catalog=rows;
 }catch{return reply({error:"CNS_UNAVAILABLE"},503)}
 const product=catalog.find(p=>p.slug===slug);
 if(!product)return reply({error:"UNKNOWN_PRODUCT"},404);
 if(!Array.isArray(product["Review Flavor Options"])||(product["Review Flavor Options"] as unknown[]).length===0){
  return reply({error:"REVIEW_FLAVOR_OPTIONS_PENDING"},409);
 }
 const answers=request.answers;
 if(!answers||typeof answers!=="object"||Array.isArray(answers))return reply({error:"INVALID_ANSWERS"},400);
 const points=validAnswers(answers,product,catalog);
 if(points===null)return reply({error:"INVALID_ANSWERS"},400);
 // Database RPC repeats eligibility inside the same transaction and enforces unique review.
 const {data:result,error}=await admin.rpc("pj_review_accept_original",{
  p_customer_id:user.id,p_slug:slug,p_answers:answers,p_points:points
 });
 if(error)return reply({error:error.code==="23505"?"ALREADY_REVIEWED":"REVIEW_NOT_ACCEPTED"},error.code==="23505"?409:409);
 return reply(result,201);
});
