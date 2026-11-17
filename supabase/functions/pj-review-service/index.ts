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
// Six immutable review answers: three discrete score levels per question.
const Q1_OPTIONS=["Weak","Comparable","Equal"];
const NOT_APPLICABLE="Not Applicable";
const FIVE_POSITION_POINTS=[1,2,3,2,1];
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
 // Heat-free is determined only by the CNS, not a browser-supplied flag.
 const heatCategory=p["Heat Category"];
 const heatFree=!heatCategory && p["Heat Level"]===0;
 let points=0;
 const q1=a.q1;
 if(typeof q1!=="string"||!Q1_OPTIONS.includes(q1))return null;
 points+=Q1_OPTIONS.indexOf(q1)+1;
 // The five-position judge sliders preserve all five ordered judgments.
 // Only positions 0..4 are accepted; the middle is the 3-point favorable answer.
 for(let i=2;i<=6;i++){
  const chosen=a["q"+i];
  if(heatFree&&(i===2||i===3||i===6)){
   if(chosen!==NOT_APPLICABLE)return null;
   points+=3; // Full credit for questions inapplicable to a heat-free product.
   continue;
  }
  if(typeof chosen!=="string"||!(/^[0-4]$/).test(chosen))return null;
  points+=FIVE_POSITION_POINTS[Number(chosen)];
 }
 const hi=HEAT.indexOf(typeof heatCategory==="string"?heatCategory:"");
 const heatOptions=hi<0?[]:HEAT.slice(Math.max(0,hi-1),Math.min(7,hi+2));
 if(heatFree ? a.q7!==NOT_APPLICABLE : !heatOptions.includes(a.q7 as string))return null;
 if(!["Yes","No"].includes(a.q8 as string)||!["Yes","No"].includes(a.q9 as string))return null;
 if(!uniqueColumn(catalog,"Food Style").includes(a.q10 as string))return null;
 // Q11 is its own approved CNS field; descriptive Primary Flavor Notes are NOT options.
 const options=p["Review Flavor Options"];
 const flavors=Array.isArray(options)?options.filter((s):s is string=>typeof s==="string"&&!!s.trim()):[];
 if(flavors.length===0)return null;
 if(!Array.isArray(a.q11)||a.q11.length<1||a.q11.length>3||
   new Set(a.q11).size!==a.q11.length||!a.q11.every(s=>flavors.includes(s)))return null;
 if(heatFree){
  if(a.q12!==NOT_APPLICABLE||a.q13!==NOT_APPLICABLE||a.q16!==NOT_APPLICABLE)return null;
 }else{
  if(!uniqueColumn(catalog,"How it Hits").includes(a.q12 as string)||
     !uniqueColumn(catalog,"Heat Finish").includes(a.q13 as string))return null;
  if(!LANE.includes(a.q16 as string))return null;
 }
 if(!Number.isInteger(a.q17)||Number(a.q17)<1||Number(a.q17)>5)return null;
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
 // Board and Yard are customer-scoped reads; never use caller-supplied customer IDs.
 if(action==="board"){
  const {data,error}=await admin.rpc("pj_review_board_for_customer",{p_customer_id:user.id});
  if(error)return reply({error:"BOARD_UNAVAILABLE"},503);
  // Match already-submitted reviews to their actual moderation state; a pending
  // submission must never be displayed as an approved/awarded review.
  const {data:reviews,error:reviewError}=await admin.from("pj_review_submissions")
    .select("product_slug_snapshot,moderation_status").eq("customer_id",user.id);
  if(reviewError)return reply({error:"BOARD_UNAVAILABLE"},503);
  const moderationBySlug=new Map((reviews||[]).map(r=>[r.product_slug_snapshot,r.moderation_status]));
  // Award truth is customer-specific and server-owned, never calculated by the Board iframe.
  const [slotsResult,creditsResult,achievementsResult,entitlementsResult]=await Promise.all([
   admin.from("pj_review_board_slots").select("row_number,slot_number"),
   admin.from("pj_review_row_slot_credits").select("row_number,slot_number").eq("customer_id",user.id),
   admin.from("pj_review_row_achievements").select("row_number").eq("customer_id",user.id),
   admin.from("pj_review_reward_entitlements").select("row_number,status").eq("customer_id",user.id)
  ]);
  if(slotsResult.error||creditsResult.error||achievementsResult.error||entitlementsResult.error)
   return reply({error:"BOARD_AWARDS_UNAVAILABLE"},503);
  const filled=new Map<number,number>();
  for(const slot of slotsResult.data||[])filled.set(slot.row_number,(filled.get(slot.row_number)||0)+1);
  const submitted=new Map<number,number>();
  for(const credit of creditsResult.data||[])submitted.set(credit.row_number,(submitted.get(credit.row_number)||0)+1);
  const achieved=new Set((achievementsResult.data||[]).map(x=>x.row_number));
  const entitlementByRow=new Map((entitlementsResult.data||[]).map(x=>[x.row_number,x.status]));
  const rows=Array.from(filled.entries()).sort((a,b)=>a[0]-b[0]).map(([rowNumber,slotsFilled])=>({
   rowNumber,slotsFilled,submitted:submitted.get(rowNumber)||0,achieved:achieved.has(rowNumber),
   entitlementStatus:entitlementByRow.get(rowNumber)||null
  }));
  return reply({products:(data||[]).map(p=>({
   ...p,moderationStatus:moderationBySlug.get(p.product_slug)??null
  })),rows});
 }
 if(action==="yard"){
  const {data:reviews,error}=await admin.from("pj_review_submissions")
    .select("id,product_slug_snapshot,submitted_at,moderation_status,q1,q2,q3,q4,q5,q6,q7,q8,q9,q10,q11,q12,q13,q16,q17,q14_original,q15_original")
    .eq("customer_id",user.id).order("submitted_at",{ascending:false});
  if(error)return reply({error:"YARD_UNAVAILABLE"},503);
  const {data:notes,error:noteError}=await admin.from("pj_review_private_notes")
    .select("review_id,food_notes,tasting_notes").eq("customer_id",user.id);
  if(noteError)return reply({error:"YARD_UNAVAILABLE"},503);
  const {data:ratings,error:ratingError}=await admin.from("pj_review_personal_ratings")
    .select("product_slug,rating").eq("customer_id",user.id);
  if(ratingError)return reply({error:"YARD_UNAVAILABLE"},503);
  const noteByReview=new Map((notes||[]).map(x=>[x.review_id,x]));
  const ratingsBySlug=new Map((ratings||[]).map(x=>[x.product_slug,x.rating]));
  return reply({reviews:(reviews||[]).map(r=>({
   id:r.id,slug:r.product_slug_snapshot,submittedAt:r.submitted_at,
   moderationStatus:r.moderation_status,
   answers:{q1:r.q1,q2:r.q2,q3:r.q3,q4:r.q4,q5:r.q5,q6:r.q6,
    q7:r.q7,q8:r.q8,q9:r.q9,q10:r.q10,q11:r.q11,q12:r.q12,q13:r.q13,
    q16:r.q16,q17:r.q17,q14:r.q14_original,q15:r.q15_original},
   privateFood:noteByReview.get(r.id)?.food_notes??r.q14_original,
   privateLove:noteByReview.get(r.id)?.tasting_notes??r.q15_original,
   personalRating:ratingsBySlug.get(r.product_slug_snapshot)??null
  }))});
 }
 const slug=typeof request.slug==="string"?request.slug:typeof request.productSlug==="string"?request.productSlug:"";
 if(!slug||slug.length>180||!/^[a-z0-9][a-z0-9-]*$/.test(slug))return reply({error:"INVALID_PRODUCT"},400);
 if(action==="reward-select"){
  const rowNumber=Number(request.rowNumber);
  if(!Number.isInteger(rowNumber)||rowNumber<1)return reply({error:"INVALID_ROW"},400);
  // Customer identity comes ONLY from the verified auth token, never from the request body.
  const {data:entitlement,error:entitlementError}=await admin
    .from("pj_review_reward_entitlements").select("status")
    .eq("customer_id",user.id).eq("row_number",rowNumber).maybeSingle();
  if(entitlementError)return reply({error:"REWARD_UNAVAILABLE"},503);
  if(!entitlement||entitlement.status==="redeemed")return reply({error:"NO_AVAILABLE_ENTITLEMENT"},409);
  const {data:products,error:productError}=await admin.from("pj_products")
    .select("id,cns_slug,is_active").eq("cns_slug",slug).limit(1);
  const product=products?.[0];
  if(productError||!product||product.is_active!==true)return reply({error:"REWARD_PRODUCT_UNAVAILABLE"},409);
  const [slotResult,commercialResult,mappingResult]=await Promise.all([
    admin.from("pj_review_board_slots").select("slot_number")
      .eq("row_number",rowNumber).eq("product_id",product.id).maybeSingle(),
    admin.from("product_commercial_state")
      .select("sync_status,square_location_enabled,square_archived,square_sold_out,availability_status,inventory_mode,quantity_on_hand")
      .eq("product_id",product.id).maybeSingle(),
    admin.from("square_product_mappings").select("product_id")
      .eq("product_id",product.id).maybeSingle()
  ]);
  if(slotResult.error||commercialResult.error||mappingResult.error)
    return reply({error:"REWARD_VALIDATION_UNAVAILABLE"},503);
  if(!slotResult.data)return reply({error:"PRODUCT_NOT_IN_COMPLETED_ROW"},409);
  const state=commercialResult.data;
  if(!mappingResult.data||!state||state.sync_status!=="current"||
     state.square_location_enabled!==true||state.square_archived===true||
     state.square_sold_out===true||state.availability_status!=="available"||
     (state.inventory_mode==="tracked"&&!(Number(state.quantity_on_hand)>0)))
    return reply({error:"REWARD_PRODUCT_UNAVAILABLE"},409);
  // Selection is NOT redemption. Failed/abandoned checkout must preserve entitlement.
  const {data:selected,error:selectionError}=await admin.from("pj_review_reward_entitlements")
    .update({status:"selected",selected_product_id:product.id,selected_at:new Date().toISOString()})
    .eq("customer_id",user.id).eq("row_number",rowNumber)
    .in("status",["available","selected"])
    .select("row_number,status,selected_product_id").maybeSingle();
  if(selectionError)return reply({error:"REWARD_SELECTION_UNAVAILABLE"},503);
  if(!selected)return reply({error:"NO_AVAILABLE_ENTITLEMENT"},409);
  return reply({ok:true,rowNumber:selected.row_number,status:selected.status,selectedProductSlug:slug});
 }
 if(action==="notes-save"){
  if(typeof request.food!=="string"||typeof request.love!=="string"||
     request.food.length>2000||request.love.length>2000)return reply({error:"INVALID_PRIVATE_NOTES"},400);
  const {data:product,error:productError}=await admin.from("pj_products")
    .select("id").eq("cns_slug",slug).maybeSingle();
  if(productError||!product)return reply({error:"UNKNOWN_PRODUCT"},404);
  const {data,error}=await admin.from("pj_review_private_notes")
    .update({food_notes:request.food,tasting_notes:request.love,updated_at:new Date().toISOString()})
    .eq("customer_id",user.id).eq("product_id",product.id).select("review_id");
  return error?reply({error:"NOTES_UNAVAILABLE"},503):
    !data?.length?reply({error:"REVIEW_NOT_FOUND"},404):reply({ok:true});
 }
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
