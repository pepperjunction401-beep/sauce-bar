// Temporary locked Railroad credential comparison. No queue or purchase access.
// A caller supplies a SHA-256 fingerprint computed locally from the Vault secret.
// Neither the underlying credential nor its digest is written to logs or returned.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response(null,{status:405});
  const token=Deno.env.get("PJ_RAILROAD_DIAGNOSTIC_TOKEN");
  if(!token||token.length<32||req.headers.get("x-railroad-diagnostic-token")!==token)
    return new Response(null,{status:404,headers:{"cache-control":"no-store"}});
  const workerKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!workerKey)return new Response(JSON.stringify({result:"ENVIRONMENT_KEY_UNAVAILABLE"}),{status:503,headers:{"content-type":"application/json","cache-control":"no-store"}});
  const body=await req.json().catch(()=>null);
  const vaultHash=body?.vault_sha256;
  if(typeof vaultHash!=="string"||!/^[a-f0-9]{64}$/.test(vaultHash))
    return new Response(JSON.stringify({error:"Missing SHA-256 fingerprint"}),{status:400,headers:{"content-type":"application/json"}});
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(workerKey));
  const workerHash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
  return new Response(JSON.stringify({result:workerHash===vaultHash?"MATCH":"MISMATCH"}),{status:200,headers:{"content-type":"application/json","cache-control":"no-store"}});
});
