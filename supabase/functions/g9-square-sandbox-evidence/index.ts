// Pepper Junction G9 — Square Sandbox evidence probe (isolated Testing only).
// READ-ONLY. No Square mutations, no Supabase purchase writes or award calls.
// NOT a replacement for Phase 2 transaction intake. NOT for Production.
// This tool verifies external evidence before an authorized end-to-end fixture.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const TESTING_HOST = "slubpfmpjgoupujptayy.supabase.co";
const SQUARE_SANDBOX = "https://connect.squareupsandbox.com";
const SQUARE_VERSION = "2026-09-16";
const TEST_REFERENCE = "PJ_G9_SANDBOX_TEST";
const STATES = new Set(
  "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ")
);

function reply(status: number, body: Record<string,unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {"Content-Type": "application/json", "Cache-Control": "no-store"},
  });
}
function isAuthorized(req: Request) {
  const supplied = new Set<string>();
  const auth = req.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) supplied.add(auth.slice(7));
  const apikey = req.headers.get("apikey");
  if (apikey) supplied.add(apikey);
  const valid = new Set<string>();
  for (const key of ["SUPABASE_SERVICE_ROLE_KEY","SUPABASE_SECRET_KEY"]) {
    const value=Deno.env.get(key);
    if (value) valid.add(value);
  }
  const stacked=Deno.env.get("SUPABASE_SECRET_KEYS");
  if (stacked) {
    try {
      const pending: unknown[]=[JSON.parse(stacked)];
      while(pending.length) {
        const it=pending.pop();
        if (typeof it==="string") valid.add(it);
        else if (Array.isArray(it)) pending.push(...it);
        else if(it && typeof it==="object") pending.push(...Object.values(it));
      }
    } catch { return false; }
  }
  return [...supplied].some(x=>valid.has(x));
}
async function getSquare(path: string, token: string) {
  // path is constructed only from hard-coded endpoints and encoded Square IDs.
  const response=await fetch(SQUARE_SANDBOX+path,{
    headers: {"Authorization": "Bearer "+token, "Square-Version":SQUARE_VERSION,
      "Content-Type":"application/json"}
  });
  const body=await response.json().catch(()=>({}));
  if (!response.ok) {
    // No Square response body returned: it could contain customer details.
    throw new Error("Square Sandbox returned HTTP "+response.status);
  }
  return body;
}
function validId(id:unknown): id is string {
  return typeof id==="string" && id.length>0 && id.length<=128 && /^[A-Za-z0-9_-]+$/.test(id);
}
Deno.serve(async (req:Request)=>{
  if(req.method!=="POST") return reply(405,{error:"POST required"});
  const serverUrl=Deno.env.get("SUPABASE_URL");
  if(!serverUrl) return reply(503,{error:"Supabase URL unavailable"});
  let configuredHost="";
  try{configuredHost=new URL(serverUrl).hostname;}catch {return reply(503,{error:"Invalid environment"});}
  if(new URL(req.url).hostname!==TESTING_HOST || configuredHost!==TESTING_HOST)
    return reply(503,{error:"G9 Sandbox tool is restricted to isolated Testing"});
  if(!isAuthorized(req)) return reply(403,{error:"Backend authorization required"});

  const access=Deno.env.get("SQUARE_SANDBOX_ACCESS_TOKEN");
  const location=Deno.env.get("SQUARE_SANDBOX_LOCATION_ID");
  const body=await req.json().catch(()=>({}));
  if(body?.action==="preflight") {
    if(!access) return reply(503,{status:"blocked",code:"SANDBOX_ACCESS_TOKEN_NOT_CONFIGURED"});
    if(!location) return reply(503,{status:"blocked",code:"SANDBOX_LOCATION_NOT_CONFIGURED"});
    try {
      const data=await getSquare("/v2/locations",access);
      const matching=(data.locations??[]).some((l:any)=>l.id===location);
      return reply(matching?200:409,{
        status:matching?"ready":"blocked",
        sandbox_api:"https://connect.squareupsandbox.com",
        sandbox_location_matches:matching,
        does_not_write_purchases:true
      });
    } catch { return reply(502,{status:"blocked",code:"SANDBOX_READ_FAILED"}); }
  }
  if(body?.action!=="verify") return reply(400,{error:"Unsupported action"});
  if(!access || !location) return reply(503,{status:"blocked",code:"SANDBOX_NOT_CONFIGURED"});
  const orderId=body.square_order_id, paymentId=body.square_payment_id;
  if(!validId(orderId)||!validId(paymentId)) return reply(400,{error:"Two Square Sandbox identifiers are required"});
  try {
    const [o,p] = await Promise.all([
      getSquare("/v2/orders/"+encodeURIComponent(orderId),access),
      getSquare("/v2/payments/"+encodeURIComponent(paymentId),access)
    ]);
    const order=o.order,payment=p.payment;
    if(!order || !payment || order.id!==orderId || payment.id!==paymentId)
      return reply(409,{status:"blocked",code:"MISSING_SQUARE_EVIDENCE"});
    if(order.reference_id!==TEST_REFERENCE)
      return reply(409,{status:"blocked",code:"NOT_AN_APPROVED_G9_SANDBOX_FIXTURE"});
    if(order.location_id!==location || payment.location_id!==location)
      return reply(409,{status:"blocked",code:"SANDBOX_LOCATION_MISMATCH"});
    if(payment.status!=="COMPLETED" || payment.order_id!==order.id)
      return reply(409,{status:"blocked",code:"PAYMENT_NOT_CONFIRMED"});
    const total=order.total_money;
    const paid=payment.total_money??payment.amount_money;
    if(!total || !paid || !Number.isSafeInteger(total.amount) || total.amount<=0 ||
       total.currency!=="USD" || paid.amount!==total.amount || paid.currency!=="USD")
      return reply(409,{status:"blocked",code:"PAYMENT_TOTAL_MISMATCH"});
    if(order.state!=="COMPLETED" && order.state!=="OPEN")
      return reply(409,{status:"blocked",code:"ORDER_NOT_COMPLETED_OR_PAID_OPEN"});
    const customerId=payment.customer_id??order.customer_id;
    if(!validId(customerId) || (order.customer_id && payment.customer_id &&
                               order.customer_id!==payment.customer_id))
      return reply(409,{status:"blocked",code:"CUSTOMER_EVIDENCE_MISSING_OR_CONFLICTING"});
    const address=(order.fulfillments??[])
      .map((f:any)=>f.shipment_details?.recipient?.address).find((a:any)=>a);
    const state=typeof address?.administrative_district_level_1==="string" ?
      address.administrative_district_level_1.toUpperCase().trim():"";
    if(address?.country!=="US" || !STATES.has(state))
      return reply(409,{status:"blocked",code:"NO_QUALIFYING_US_SHIPPING_STATE"});
    if(!Array.isArray(order.line_items) || !order.line_items.length)
      return reply(409,{status:"blocked",code:"ORDER_LINES_MISSING"});
    if(order.line_items.some((line:any)=>!validId(line.uid)||!validId(line.catalog_object_id)))
      return reply(409,{status:"blocked",code:"CATALOG_LINE_EVIDENCE_MISSING"});
    return reply(200,{
      status:"sandbox_payment_verified", order_id:orderId,payment_id:paymentId,
      square_state:order.state,paid_minor_units:total.amount,currency:"USD",
      destination_state:state,destination_country:"US",
      square_customer_present:true,catalog_line_count:order.line_items.length,
      completed_evidence_at:order.closed_at??payment.updated_at??payment.created_at??null,
      imported_into_supabase:false,state_badge_awarded:false
    });
  } catch {
    return reply(502,{status:"blocked",code:"SQUARE_SANDBOX_VERIFICATION_UNAVAILABLE"});
  }
});
