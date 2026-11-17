// Pepper Junction Review Board — isolated Square SANDBOX checkout.
// Testing project only. Never use Production Square credentials, URL, or cart endpoint.
// An entitlement can be consumed only after direct Square sandbox payment verification.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.83.0";
const TESTING="slubpfmpjgoupujptayy";
const BASE="https://connect.squareupsandbox.com";
const V="2026-09-16";
const CORS={
 "access-control-allow-origin":"*",
 "access-control-allow-headers":"authorization,apikey,content-type,x-client-info",
 "access-control-allow-methods":"POST, OPTIONS","cache-control":"no-store"
};
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,
 headers:{...CORS,"content-type":"application/json"}});
function secret():string|undefined{
 try{const j=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");
   return typeof j.default==="string"?j.default:undefined;}catch{return undefined;}
}
function matchText(x:unknown,n=150){return typeof x==="string"&&x.length>0&&x.length<=n;}
function sq(path:string,method:string,accessToken:string,body?:unknown){
 return fetch(BASE+path,{method,headers:{
  "Authorization":"Bearer "+accessToken,"Square-Version":V,"Content-Type":"application/json"
 },body:body===undefined?undefined:JSON.stringify(body)}).then(async r=>{
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error("SQUARE_SANDBOX_ERROR_"+r.status);
  return data;
 });
}
function liveCommercial(c:any){
 return c&&c.sync_status==="current"&&c.square_location_enabled===true&&
  c.square_archived!==true&&c.square_sold_out!==true&&c.availability_status==="available"&&
  (c.inventory_mode!=="tracked"||Number(c.quantity_on_hand)>0);
}
type Product={id:string;cns_slug:string;is_active:boolean};
type MapRow={product_id:string;square_item_library_token:string};
type CartLine={product_id:string;quantity:number};
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
 if(req.method!=="POST")return reply({error:"METHOD_NOT_ALLOWED"},405);
 const url=Deno.env.get("SUPABASE_URL")||"";
 if(!url.includes(TESTING))return reply({error:"TESTING_PROJECT_ONLY"},503);
 const key=secret();
 const sandboxToken=Deno.env.get("SQUARE_SANDBOX_ACCESS_TOKEN");
 const location=Deno.env.get("SQUARE_SANDBOX_LOCATION_ID");
 if(!key||!sandboxToken||!location)return reply({error:"SANDBOX_NOT_CONFIGURED"},503);
 const jwt=(req.headers.get("authorization")||"").replace(/^Bearer /i,"").trim();
 if(!jwt)return reply({error:"SIGN_IN_REQUIRED"},401);
 const admin=createClient(url,key,{auth:{persistSession:false}});
 const {data:u,error:authError}=await admin.auth.getUser(jwt);
 const user=u?.user;
 if(authError||!user||!user.email_confirmed_at)return reply({error:"SIGN_IN_REQUIRED"},401);
 const body=await req.json().catch(()=>null);
 if(!body||typeof body!=="object")return reply({error:"INVALID_REQUEST"},400);
 const row=Number(body.rowNumber);
 if(!Number.isInteger(row)||row<1)return reply({error:"INVALID_ROW"},400);
 const {data:e,error:eError}=await admin.from("pj_review_reward_entitlements")
  .select("status,selected_product_id").eq("customer_id",user.id)
  .eq("row_number",row).maybeSingle();
 if(eError||!e)return reply({error:"REWARD_NOT_FOUND"},404);
 if(body.action!=="confirm"&&e.status==="redeemed")
  return reply({error:"REWARD_ALREADY_REDEEMED"},409);

 if(body.action==="confirm"){
  const orderId=body.square_order_id;
  if(!matchText(orderId,120))return reply({error:"INVALID_ORDER"},400);
  const {data:attempt,error:aError}=await admin.from("pj_review_reward_checkout_attempts")
   .select("id,state,selected_product_id").eq("customer_id",user.id)
   .eq("row_number",row).eq("square_order_id",orderId).maybeSingle();
  if(aError||!attempt)return reply({error:"UNKNOWN_REWARD_ORDER"},404);
  // A replay of the same Square-confirmed order is successful, not a second redemption.
  if(attempt.state==="paid_verified"&&e.status==="redeemed")
   return reply({ok:true,status:"redeemed",alreadyConfirmed:true});
  if(attempt.state!=="opened"||e.status!=="selected"||
     attempt.selected_product_id!==e.selected_product_id)
   return reply({error:"REWARD_ORDER_NOT_ELIGIBLE"},409);
  let order:any;
  try{order=(await sq("/v2/orders/"+encodeURIComponent(orderId),"GET",sandboxToken)).order;}
  catch{return reply({error:"SQUARE_VERIFICATION_UNAVAILABLE"},503);}
  if(!order||order.id!==orderId||order.location_id!==location||
     !Array.isArray(order.line_items)||!order.line_items.length)
   return reply({error:"ORDER_VERIFICATION_FAILED"},409);
  const zeroLines=order.line_items.filter((x:any)=>x.total_money?.amount===0);
  const paidLines=order.line_items.filter((x:any)=>x.total_money?.amount>0);
  if(zeroLines.length!==1||!paidLines.length||
     paidLines.some((x:any)=>Number(x.total_discount_money?.amount||0)!==0)||
     !(Number(order.total_money?.amount)>0)||
     !(Array.isArray(zeroLines[0].applied_discounts)&&
       zeroLines[0].applied_discounts.some((d:any)=>d.discount_uid==="PJ_REVIEW_FREE")))
   return reply({error:"REWARD_ORDER_CONTENT_MISMATCH"},409);
  const {data:chosen}=await admin.from("pj_review_sandbox_catalog")
    .select("square_sandbox_item_id,sandbox_verified_at")
    .eq("product_id",e.selected_product_id).eq("fixture_role","reward").maybeSingle();
  if(!chosen?.sandbox_verified_at||!chosen.square_sandbox_item_id)
   return reply({error:"REWARD_SANDBOX_MAPPING_MISSING"},409);
  // Square variation -> item mapping must be confirmed directly from Sandbox catalog.
  let item:any;
  try{
   const vId=zeroLines[0].catalog_object_id;
   const data=await sq("/v2/catalog/object/"+encodeURIComponent(vId),"GET",sandboxToken);
   item=data.object;
  }catch{return reply({error:"REWARD_CATALOG_UNAVAILABLE"},503);}
  if(!item||item.type!=="ITEM_VARIATION"||
     item.item_variation_data?.item_id!==chosen.square_sandbox_item_id)
   return reply({error:"REWARD_LINE_IDENTITY_MISMATCH"},409);
  // Square payment links may leave a fully captured order OPEN: verify payment, not redirect.
  const tenderIds=[...new Set((order.tenders||[])
   .map((t:any)=>t.payment_id).filter((x:unknown)=>matchText(x,140)))];
  if(!tenderIds.length)return reply({error:"PAYMENT_NOT_CONFIRMED"},409);
  let paid=0;
  try{
   for(const paymentId of tenderIds){
    const p=(await sq("/v2/payments/"+encodeURIComponent(paymentId),"GET",sandboxToken)).payment;
    if(!p||p.order_id!==orderId||p.location_id!==location||
       p.status!=="COMPLETED"||p.total_money?.currency!=="USD")
     return reply({error:"PAYMENT_NOT_CONFIRMED"},409);
    paid+=Number(p.total_money?.amount||0)-Number(p.refunded_money?.amount||0);
   }
  }catch{return reply({error:"PAYMENT_VERIFICATION_UNAVAILABLE"},503);}
  if(paid<Number(order.total_money?.amount)||paid<=0)
   return reply({error:"PAYMENT_NOT_CONFIRMED"},409);
  const {data:done,error:doneError}=await admin.rpc("pj_review_reward_finalize_verified_order",{
   p_customer_id:user.id,p_row_number:row,p_square_order_id:orderId
  });
  if(doneError||done!==true)return reply({error:"REDEMPTION_FINALIZATION_FAILED"},503);
  return reply({ok:true,status:"redeemed"});
 }
 if(body.action!=="create")return reply({error:"UNKNOWN_ACTION"},400);
 if(e.status!=="selected"||!e.selected_product_id)
  return reply({error:"SELECT_REWARD_FIRST"},409);
 if(!matchText(body.checkoutRequestId,100)||!/^[A-Za-z0-9-]{8,100}$/.test(body.checkoutRequestId))
  return reply({error:"INVALID_REQUEST_ID"},400);
 const items=body.items;
 if(!Array.isArray(items)||items.length<1||items.length>25||body.loyaltyToken||
    body.loyaltyExchange||body.freeItem||body.priceOverride)
  return reply({error:"PAID_MERCHANDISE_REQUIRED"},400);
 const quantities=new Map<string,number>();
 for(const x of items as CartLine[]){
  if(!matchText(x.product_id,180)||!/^[a-z0-9-]+$/.test(x.product_id)||
    !Number.isInteger(x.quantity)||x.quantity<1||x.quantity>99)
   return reply({error:"INVALID_PAID_ITEM"},400);
  const q=(quantities.get(x.product_id)||0)+x.quantity;
  if(q>99)return reply({error:"INVALID_PAID_QUANTITY"},400);
  quantities.set(x.product_id,q);
 }
 const slugs=[...quantities.keys()];
 const {data:chosenProduct}=await admin.from("pj_products")
  .select("id,cns_slug,is_active").eq("id",e.selected_product_id).maybeSingle();
 if(!chosenProduct||chosenProduct.is_active!==true)return reply({error:"REWARD_ITEM_UNAVAILABLE"},409);
 const [slotRes,allRes,attemptRes]=await Promise.all([
  admin.from("pj_review_board_slots").select("slot_number").eq("row_number",row)
   .eq("product_id",chosenProduct.id).maybeSingle(),
  admin.from("pj_products").select("id,cns_slug,is_active")
   .in("cns_slug",[...slugs,chosenProduct.cns_slug]),
  admin.from("pj_review_reward_checkout_attempts").select("id")
   .eq("customer_id",user.id).eq("row_number",row)
   .in("state",["creating","opened"]).limit(1)
 ]);
 if(slotRes.error||!slotRes.data||allRes.error||attemptRes.error)
  return reply({error:"REWARD_VALIDATION_UNAVAILABLE"},503);
 if(attemptRes.data?.length)return reply({error:"REWARD_CHECKOUT_IN_PROGRESS"},409);
 const products=(allRes.data||[]) as Product[];
 if(products.length!==new Set([...slugs,chosenProduct.cns_slug]).size||
    products.some(p=>p.is_active!==true))
  return reply({error:"UNAVAILABLE_PAID_ITEM"},409);
 const ids=products.map(p=>p.id);
 const {data:sandboxProducts,error:sandboxError}=await admin.from("pj_review_sandbox_catalog")
  .select("product_id,fixture_role,square_sandbox_item_id,square_sandbox_variation_id,expected_price_cents,sandbox_verified_at")
  .in("product_id",ids);
 if(sandboxError)return reply({error:"SANDBOX_CATALOG_VALIDATION_UNAVAILABLE"},503);
 const ready=new Map((sandboxProducts||[]).map((x:any)=>[x.product_id,x]));
 const selectedFixture=ready.get(chosenProduct.id);
 if(!selectedFixture||selectedFixture.fixture_role!=="reward")
  return reply({error:"REWARD_NOT_IN_SANDBOX_FIXTURE"},409);
 for(const p of products){
  const f=ready.get(p.id);
  if(!f||!f.sandbox_verified_at||!f.square_sandbox_item_id||
    !f.square_sandbox_variation_id||!(Number(f.expected_price_cents)>0))
   return reply({error:"SANDBOX_CATALOG_NOT_READY"},409);
 }
 const mappings=new Map((sandboxProducts||[]).map((x:any)=>[x.product_id,x.square_sandbox_item_id]));

 // Square's item-level percentage discount applies ONLY to the reward variation.
 // Never accept prices or variation IDs from the browser.
 const catalogItemIds=[...new Set(products.map(p=>mappings.get(p.id)))];
 let catalog:any;
 try{catalog=await sq("/v2/catalog/batch-retrieve","POST",sandboxToken,
  {object_ids:catalogItemIds,include_related_objects:true});}
 catch{return reply({error:"SANDBOX_CATALOG_UNAVAILABLE"},503);}
 const found=new Map<string,any>();
 for(const o of [...(catalog.objects||[]),...(catalog.related_objects||[])])if(o.id)found.set(o.id,o);
 const variations=new Map<string,string>();
 for(const p of products){
  const item=found.get(mappings.get(p.id));
  if(!item||item.type!=="ITEM"||item.is_deleted===true||
     !Array.isArray(item.item_data?.variations)||item.item_data.variations.length!==1)
   return reply({error:"SANDBOX_VARIATION_UNAVAILABLE"},409);
  const vid=item.item_data.variations[0].id;
  const variant=found.get(vid)||item.item_data.variations[0];
  const price=variant.item_variation_data?.price_money;
  const fixture=ready.get(p.id);
  if(!vid||vid!==fixture.square_sandbox_variation_id||!price||
     Number(price.amount)!==Number(fixture.expected_price_cents)||price.currency!=="USD")
   return reply({error:"SANDBOX_VARIATION_PRICE_MISMATCH"},409);
  variations.set(p.cns_slug,vid);
 }
 const paidOrderItems=slugs.map(slug=>({
  quantity:String(quantities.get(slug)),catalog_object_id:variations.get(slug)
 }));
 const rewardVariation=variations.get(chosenProduct.cns_slug);
 const order={
  location_id:location,
  line_items:[...paidOrderItems,{
   quantity:"1",catalog_object_id:rewardVariation,
   applied_discounts:[{discount_uid:"PJ_REVIEW_FREE"}]
  }],
  discounts:[{uid:"PJ_REVIEW_FREE",name:"Review Board Complimentary",
   type:"FIXED_PERCENTAGE",percentage:"100",scope:"LINE_ITEM"}],
  pricing_options:{auto_apply_taxes:true,auto_apply_discounts:false}
 };
 // Validate Square's own price calculation BEFORE creating a checkout link.
 // The discounted line must be exactly $0, and paid lines must receive NO discount.
 let calculated:any;
 try{
  calculated=(await sq("/v2/orders/calculate","POST",sandboxToken,{order})).order;
 }catch{return reply({error:"SANDBOX_DISCOUNT_PREFLIGHT_UNAVAILABLE"},503);}
 const preflightReward=(calculated?.line_items||[]).filter((l:any)=>
   l.catalog_object_id===rewardVariation&&
   (l.applied_discounts||[]).some((d:any)=>d.discount_uid==="PJ_REVIEW_FREE"));
 const preflightPaid=(calculated?.line_items||[]).filter((l:any)=>
   l.catalog_object_id!==rewardVariation);
 if(preflightReward.length!==1||preflightReward[0].quantity!=="1"||
    preflightReward[0].total_money?.amount!==0||
    preflightPaid.length!==slugs.length||
    preflightPaid.some((l:any)=>!(l.total_money?.amount>0)||
       Number(l.total_discount_money?.amount||0)!==0)||
    !(Number(calculated?.total_money?.amount)>0))
  return reply({error:"SANDBOX_DISCOUNT_PREFLIGHT_FAILED"},409);
 // DB unique constraint prevents simultaneous payment-link reservations.
 const {data:reservation,error:reserveError}=await admin.rpc("pj_review_reward_reserve_checkout",{
  p_customer_id:user.id,p_row_number:row,
  p_expected_product_id:chosenProduct.id,p_request_id:body.checkoutRequestId
 });
 if(reserveError||!reservation)return reply({error:"REWARD_CHECKOUT_ALREADY_OPEN"},409);
 let link:any;
 try{
  const data=await sq("/v2/online-checkout/payment-links","POST",sandboxToken,{
    idempotency_key:"pj-review-"+body.checkoutRequestId,
    description:"Pepper Junction Review Board Sandbox",
    order,checkout_options:{ask_for_shipping_address:true}
  });
  link=data.payment_link;
 }catch{
  await admin.from("pj_review_reward_checkout_attempts").update({state:"cancelled"})
   .eq("checkout_request_id",body.checkoutRequestId).eq("state","creating");
  return reply({error:"SANDBOX_CHECKOUT_UNAVAILABLE"},503);
 }
 if(!matchText(link?.url,1000)||!matchText(link?.order_id,120)||!matchText(link?.id,120))
  return reply({error:"SANDBOX_CHECKOUT_VERIFY_MANUALLY"},503);
 // Guard against Square silently distributing the discount across paid merchandise.
 let created:any;
 try{created=(await sq("/v2/orders/"+encodeURIComponent(link.order_id),"GET",sandboxToken)).order;}
 catch{return reply({error:"SANDBOX_ORDER_REQUIRES_VERIFICATION"},503);}
 const rewardLines=(created?.line_items||[]).filter((l:any)=>
   l.catalog_object_id===rewardVariation&&
   (l.applied_discounts||[]).some((d:any)=>d.discount_uid==="PJ_REVIEW_FREE"));
 const fullyFree=rewardLines.length===1&&rewardLines[0].quantity==="1"&&
   rewardLines[0].total_money?.amount===0;
 const paidLineCount=(created?.line_items||[]).filter((l:any)=>l.total_money?.amount>0).length;
 const createdPaid=(created?.line_items||[]).filter((l:any)=>l.total_money?.amount>0);
 if(!fullyFree||paidLineCount!==slugs.length||
    createdPaid.some((l:any)=>Number(l.total_discount_money?.amount||0)!==0)||
    !(Number(created?.total_money?.amount)>0))
  return reply({error:"SANDBOX_DISCOUNT_VALIDATION_FAILED"},503);
 const {error:openError}=await admin.from("pj_review_reward_checkout_attempts").update({
  state:"opened",square_order_id:link.order_id,
  square_payment_link_id:link.id,opened_at:new Date().toISOString()
 }).eq("customer_id",user.id).eq("row_number",row)
  .eq("checkout_request_id",body.checkoutRequestId).eq("state","creating");
 if(openError)return reply({error:"SANDBOX_ATTEMPT_RECORD_FAILED"},503);
 return reply({ok:true,square_order_id:link.order_id,checkout_url:link.url});
});
