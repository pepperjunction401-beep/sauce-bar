// Temporary, isolated Railroad credential diagnostic.
// It never reads the purchase queue, calls Square, or reveals any credential.
// Remove after the authorized diagnostic.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
Deno.serve((req: Request) => {
  if (req.method !== "POST") return new Response(null, {status:405});
  const expected = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!expected) return new Response(JSON.stringify({result:"ENVIRONMENT_KEY_UNAVAILABLE"}), {status:503, headers:{"content-type":"application/json","cache-control":"no-store"}});
  const authorization = req.headers.get("Authorization");
  const apiKey = req.headers.get("apikey");
  const match = authorization === "Bearer " + expected && apiKey === expected;
  return new Response(JSON.stringify({result:match ? "MATCH" : "MISMATCH"}), {
    status:match ? 200 : 403,
    headers:{"content-type":"application/json","cache-control":"no-store"}
  });
});
