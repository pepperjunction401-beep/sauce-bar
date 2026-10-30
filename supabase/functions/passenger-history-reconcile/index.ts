// Railroad Passenger Class historical evidence reconciliation.
// Independent of Phase 2 importer and product mapping. Service-role only.
// Invoke with {"customer_id":"uuid"}; max 50 most recent completed attached orders per run.
// Idempotent because evidence is keyed by (purchase_id,square_line_uid).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { recordPassengerMerchandiseEvidence } from "../_shared/passenger-merchandise-evidence.ts";
import { discoverUnmappedRailroadOrders } from "../_shared/passenger-square-discovery.ts";

const SQUARE_URL="https://connect.squareup.com/v2";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function reply(payload:unknown,status=200){return new Response(JSON.stringify(payload),{status,headers:{"content-type":"application/json","cache-control":"no-store"}})}
Deno.serve(async(req)=>{
 if(req.method!=="POST")return reply({error:"Method not allowed"},405);
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),square=Deno.env.get("SQUARE_PRODUCTION_ACCESS_TOKEN");
 if(!url||!key||!square)return reply({error:"Not configured"},503);
 // Explicit service-role caller only, never a customer-facing endpoint.
 const bearer=req.headers.get("Authorization")||"";
 if(bearer!=="Bearer "+key||req.headers.get("apikey")!==key)return reply({error:"Service role required"},403);
 const body=await req.json().catch(()=>({}));
 const admin=createClient(url,key,{auth:{persistSession:false}});
 // Queue-driven invocation is automatic after verified account + attached purchase.
 let customerId=body.customer_id;
 if(customerId===undefined){
  const {data:pending,error:queueError}=await admin.from("pj_passenger_history_reconciliation_queue")
   .select("customer_id").is("completed_at",null).order("requested_at",{ascending:true}).limit(1);
  if(queueError)return reply({error:"Queue unavailable"},503);
  if(!pending?.length)return reply({status:"idle",processed:0});
  customerId=pending[0].customer_id;
 }
 if(typeof customerId!=="string"||!UUID.test(customerId))return reply({error:"Invalid customer"},400);
 const {data:profile,error:profileError}=await admin.from("customer_profiles").select("id,account_state").eq("id",customerId).maybeSingle();
 if(profileError||profile?.account_state!=="verified_matched")return reply({error:"Customer not verified"},403);
 const {data:orders,error:orderError}=await admin.from("purchases")
  .select("id,square_order_id,square_location_id")
  .eq("customer_id",customerId).eq("purchase_status","completed").eq("import_status","attached")
  .order("completed_at",{ascending:true}).limit(51);
 if(orderError)return reply({error:"Purchase lookup failed"},503);
 if((orders||[]).length>50)return reply({error:"More than 50 orders; pagination required before backfill"},409);
 let reconciled=0,skipped=0,failures=0;
 for(const p of orders||[]){
  if(!p.square_order_id){skipped++;continue;}
  const result=await fetch(SQUARE_URL+"/orders/"+encodeURIComponent(p.square_order_id),{
   headers:{"Authorization":"Bearer "+square,"Square-Version":"2025-10-16"}
  });
  if(!result.ok){failures++;continue;}
  const payload=await result.json().catch(()=>({}));
  const order=payload.order;
  if(!order||order.id!==p.square_order_id||!["COMPLETED","OPEN"].includes(order.state)||
     (p.square_location_id&&order.location_id!==p.square_location_id)){failures++;continue;}
  const lines=Array.isArray(order.line_items)?order.line_items:[];
  if(!lines.length){skipped++;continue;}
  try {await recordPassengerMerchandiseEvidence(admin,p.id,lines);reconciled++;}
  catch(_){failures++;}
 }
 let discovery=null;
 if(failures===0){
  const location=Deno.env.get("SQUARE_PEPPER_JUNCTION_LOCATION_ID");
  if(!location) return reply({error:"Square location not configured"},503);
  try{discovery=await discoverUnmappedRailroadOrders(admin,customerId,square,location)}
  catch(error){failures++;await admin.from("pj_passenger_history_reconciliation_queue").update({last_error:"Square history discovery failed"}).eq("customer_id",customerId);}
 }
 if(failures===0){
  await admin.from("pj_passenger_history_reconciliation_queue").update({completed_at:new Date().toISOString(),last_error:null}).eq("customer_id",customerId);
 } else {
  await admin.from("pj_passenger_history_reconciliation_queue").update({last_error:failures+" Square orders not recovered"}).eq("customer_id",customerId);
 }
 return reply({reconciled_orders:reconciled,skipped_orders:skipped,failed_orders:failures,independent_history:discovery,customer_id:customerId});
});