// Pepper Junction Passenger Notes — public, aggregate-only read model.
// Strictly read-only: approved reviews; no personal identifiers, originals,
// private ratings, scoring, badges, payments, or moderation writes.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.83.0";

const MIN_APPROVED = 5;
const PAGE_SIZE = 500;
const MAX_PAGES = 100;
const headers = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "apikey,authorization,content-type,x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
  "cache-control": "public, max-age=60",
  "content-type": "application/json"
};
function reply(data: unknown, status=200) {
  return new Response(JSON.stringify(data), { status, headers });
}
function secretKey(): string|undefined {
  try {
    const keys=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");
    return typeof keys.default === "string" ? keys.default : undefined;
  } catch { return undefined; }
}
type Answers = {q10:string|null;q11:string[]|null;q12:string|null;q13:string|null};
function winner(values: string[]): string|null {
  const counts=new Map<string,number>();
  for (const value of values) {
    if (!value || value==="Not Applicable") continue;
    counts.set(value,(counts.get(value)||0)+1);
  }
  if (!counts.size) return null;
  const maximum=Math.max(...counts.values());
  const leaders=[...counts].filter(([,n])=>n===maximum);
  return leaders.length===1 ? leaders[0][0] : "Passengers are split";
}
Deno.serve(async (request) => {
  if (request.method==="OPTIONS") return new Response(null,{status:204,headers});
  if (request.method!=="POST") return reply({error:"METHOD_NOT_ALLOWED"},405);
  let payload:unknown;
  try { payload=await request.json(); } catch { return reply({error:"BAD_REQUEST"},400); }
  const slug=(payload&&typeof payload==="object"&&"slug" in payload)
    ? (payload as {slug:unknown}).slug : null;
  if(typeof slug!=="string" || slug.length>180 || !/^[a-z0-9][a-z0-9-]*$/.test(slug))
    return reply({error:"INVALID_PRODUCT"},400);
  const url=Deno.env.get("SUPABASE_URL"), key=secretKey();
  if(!url||!key) return reply({error:"SERVICE_UNAVAILABLE"},503);
  const admin=createClient(url,key,{auth:{persistSession:false}});
  // Query only the four fields being aggregated. Never select identities or prose.
  const rows:Answers[]=[];
  for(let page=0;page<MAX_PAGES;page++){
    const start=page*PAGE_SIZE;
    const {data,error}=await admin.from("pj_review_submissions")
      .select("q10,q11,q12,q13")
      .eq("product_slug_snapshot",slug).eq("moderation_status","approved")
      .range(start,start+PAGE_SIZE-1);
    if(error)return reply({error:"NOTES_UNAVAILABLE"},503);
    const batch=(data||[]) as Answers[];
    rows.push(...batch);
    if(batch.length<PAGE_SIZE)break;
    if(page===MAX_PAGES-1)return reply({error:"NOTES_LIMIT_REACHED"},503);
  }
  if(rows.length<MIN_APPROVED)return reply({available:false});
  const food=winner(rows.map(r=>r.q10==="Snack"?"Snacking":r.q10||""));
  const flavor=winner(rows.flatMap(r=>[...new Set(Array.isArray(r.q11)?r.q11:[])]));
  return reply({
    available:true,
    cards:{
      arrival:winner(rows.map(r=>r.q12||"")),
      finish:winner(rows.map(r=>r.q13||"")),
      food,
      flavor
    }
  });
});
