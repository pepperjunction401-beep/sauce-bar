// Read-only checkout confirmation for clearing the browser cart.
// Returns only a boolean; never trusts a Square return-page redirect as proof.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const allowed=new Set(["https://pepperjunction401.com","https://www.pepperjunction401.com","https://pepperjunction401-beep.github.io"]);
const testingProject=Deno.env.get("SUPABASE_URL")==="https://slubpfmpjgoupujptayy.supabase.co";
Deno.serve(async req=>{
 const origin=req.headers.get("Origin")||"";
 const permitted=allowed.has(origin)||(testingProject&&/^http:\/\/(?:localhost|127\.0\.0\.1):(?:8000|8080)$/.test(origin));
 const headers={"Access-Control-Allow-Origin":permitted?origin:"","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"content-type","Vary":"Origin","Content-Type":"application/json","Cache-Control":"no-store"};
 if(!permitted)return new Response(JSON.stringify({confirmed:false}),{status:403,headers});
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST")return new Response(JSON.stringify({confirmed:false}),{status:405,headers});
 const body=await req.json().catch(()=>({}));
 const order=body?.square_order_id;
 if(typeof order!=="string"||!/^[A-Za-z0-9_-]{8,80}$/.test(order))return new Response(JSON.stringify({confirmed:false}),{status:400,headers});
 const url=Deno.env.get("SUPABASE_URL");
 let key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!key&&testingProject){
   key=Deno.env.get("SUPABASE_SECRET_KEY")||"";
   if(!key){try{key=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||"";}catch(_){}}
 }
 if(!url||!key)return new Response(JSON.stringify({confirmed:false}),{status:503,headers});
 const admin=createClient(url,key,{auth:{persistSession:false}});
 const {data,error}=await admin.from("purchases").select("id,customer_id").eq("square_order_id",order).eq("purchase_status","completed").eq("import_status","attached").limit(1);
 if(error)return new Response(JSON.stringify({confirmed:false}),{status:503,headers});
 if(!data?.length)return new Response(JSON.stringify({confirmed:false}),{headers});
 // This is a read-only status check: the established purchase importer
 // finalizes the reward. Never let a completed paid order clear an unredeemed
 // reward from the user's cart.
 const rewardRow=body?.reward_row_number;
 // Paid-only orders never query Review Board tables or depend on migrations.
 if(rewardRow===null||rewardRow===undefined)
   return new Response(JSON.stringify({confirmed:true}),{headers});
 if(!Number.isInteger(rewardRow)||rewardRow<1)
   return new Response(JSON.stringify({confirmed:false}),{status:400,headers});
 const {data:attempt,error:attemptError}=await admin.from("pj_review_reward_checkout_attempts")
   .select("customer_id,row_number,state").eq("square_order_id",order)
   .eq("row_number",rewardRow).maybeSingle();
 if(attemptError)return new Response(JSON.stringify({confirmed:false}),{status:503,headers});
 if(!attempt)return new Response(JSON.stringify({confirmed:false}),{headers});
 {
   if(attempt.customer_id!==data[0].customer_id||attempt.state!=="paid_verified")
     return new Response(JSON.stringify({confirmed:false}),{headers});
   const {data:entitlement,error:rewardError}=await admin.from("pj_review_reward_entitlements")
     .select("status,redeemed_square_order_id")
     .eq("customer_id",attempt.customer_id).eq("row_number",attempt.row_number).maybeSingle();
   if(rewardError||!entitlement)return new Response(JSON.stringify({confirmed:false}),{status:503,headers});
   if(entitlement.status!=="redeemed"||entitlement.redeemed_square_order_id!==order)
     return new Response(JSON.stringify({confirmed:false}),{headers});
 }
 return new Response(JSON.stringify({confirmed:true}),{headers});
});