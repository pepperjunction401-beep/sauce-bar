// Isolated Railroad diagnostic; disabled until an independent diagnostic token is configured.
// No Square access, queue reads, credential disclosure, or purchase processing.
// Never publish without a separately approved, short-lived diagnostic secret.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
Deno.serve((req: Request) => {
  if (req.method !== "POST") return new Response(null, {status:405});
  const diagnosticToken = Deno.env.get("PJ_RAILROAD_DIAGNOSTIC_TOKEN");
  // Fail closed unless a separate explicit diagnostic token is provisioned.
  if (!diagnosticToken || diagnosticToken.length < 32 ||
      req.headers.get("x-railroad-diagnostic-token") !== diagnosticToken)
    return new Response(null, {status:404, headers:{"cache-control":"no-store"}});
  const expected = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!expected) return new Response(JSON.stringify({result:"ENVIRONMENT_KEY_UNAVAILABLE"}), {
    status:503,headers:{"content-type":"application/json","cache-control":"no-store"}});
  const authorization = req.headers.get("Authorization");
  const apiKey = req.headers.get("apikey");
  // Compare exactly what the actual worker compares, never echo either value.
  const results = {
    authorization_matches: authorization === "Bearer " + expected,
    apikey_matches: apiKey === expected
  };
  return new Response(JSON.stringify(results), {status:200,headers:{
    "content-type":"application/json","cache-control":"no-store"
  }});
});
