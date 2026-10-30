// Read-only checkout confirmation for clearing the browser cart.
// Returns only a boolean; never trusts a Square return-page redirect as proof.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const allowed=new Set(["https://pepperjunction401.com","https://www.pepperjunction401.com","https://pepperjunction401-beep.github.io"]);
Deno.serve(async req=>{
 const origin=req.headers.get("Origin")||"";
 const headers={"Access-Control-Allow-Origin":allowed.has(origin)?origin:"","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"content-type","Vary":"Origin","Content-Type":"application/json","Cache-Control":"no-store"};
 if(!allowed.has(origin))return new Response(JSON.stringify({confirmed:false}),{status:403,headers});
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST")return new Response(JSON.stringify({confirmed:false}),{status:405,headers});
 const body=await req.json().catch(()=>({}));
 const order=body?.square_order_id;
 if(typeof order!=="string"||!/^[A-Za-z0-9_-]{8,80}$/.test(order))return new Response(JSON.stringify({confirmed:false}),{status:400,headers});
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!key)return new Response(JSON.stringify({confirmed:false}),{status:503,headers});
 const admin=createClient(url,key,{auth:{persistSession:false}});
 const {data,error}=await admin.from("purchases").select("id").eq("square_order_id",order).eq("purchase_status","completed").eq("import_status","attached").limit(1);
 if(error)return new Response(JSON.stringify({confirmed:false}),{status:503,headers});
 return new Response(JSON.stringify({confirmed:!!data?.length}),{headers});
});