// Railroad-only historical discovery, independent of CNS and Phase 2 imports.
import { passengerMerchandiseEvidence } from "./passenger-merchandise-evidence.ts";
const SQUARE="https://connect.squareup.com/v2";
const VERSION="2026-09-16";
type Admin={from:(table:string)=>any};
export async function discoverUnmappedRailroadOrders(admin:Admin,customerId:string,token:string,locationId:string){
 const {data:links,error:linkError}=await admin.from("square_customer_links")
  .select("square_customer_id,is_active,is_historical_alias").eq("customer_id",customerId);
 if(linkError)throw new Error("Square identity links unavailable");
 const accepted=[...new Set((links??[]).filter((x:any)=>x.is_active||x.is_historical_alias).map((x:any)=>x.square_customer_id).filter(Boolean))] as string[];
 if(!accepted.length)return {discovered:0,inserted:0,skipped:0};
 let discovered=0,inserted=0,skipped=0;
 const visited=new Set<string>();
 for(const squareCustomerId of accepted){
  let cursor:string|undefined;
  do{
   const response=await fetch(SQUARE+"/orders/search",{method:"POST",
    headers:{Authorization:"Bearer "+token,"Square-Version":VERSION,"Content-Type":"application/json"},
    body:JSON.stringify({location_ids:[locationId],limit:100,cursor,
     query:{filter:{customer_filter:{customer_ids:[squareCustomerId]},state_filter:{states:["COMPLETED"]}},
      sort:{sort_field:"CLOSED_AT",sort_order:"ASC"}}})});
   if(!response.ok)throw new Error("Square order discovery HTTP "+response.status);
   const payload=await response.json();
   for(const order of payload.orders??[]){
    if(!order.id||visited.has(order.id)||order.location_id!==locationId)continue;
    visited.add(order.id);discovered++;
    if(order.state!=="COMPLETED"){skipped++;continue;}
    const {data:existing,error:existingError}=await admin.from("purchases").select("id")
     .eq("square_order_id",order.id).limit(1);
    if(existingError)throw new Error("Purchase ownership lookup failed");
    if(existing?.length){skipped++;continue;}
    const parsed=passengerMerchandiseEvidence(order.line_items??[],customerId);
    if(!parsed.length){skipped++;continue;}
    const records=parsed.map((line:any)=>({
     customer_id:customerId,square_customer_id:squareCustomerId,square_order_id:order.id,
     square_line_uid:line.square_line_uid,square_item_name:line.square_item_name,
     classification:line.classification,gross_line_cents:line.gross_line_cents,
     merchandise_net_cents:line.merchandise_net_cents
    }));
    const {error}=await admin.from("pj_passenger_unmapped_square_evidence")
     .upsert(records,{onConflict:"square_order_id,square_line_uid",ignoreDuplicates:true});
    if(error)throw new Error("Independent evidence insert failed: "+error.message);
    inserted+=records.length;
   }
   cursor=typeof payload.cursor==="string"&&payload.cursor?payload.cursor:undefined;
  }while(cursor);
 }
 return {discovered,inserted,skipped};
}
