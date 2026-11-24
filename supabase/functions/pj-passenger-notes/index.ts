// Pepper Junction Passenger Notes — public, aggregate-only read model.
// Strictly read-only: approved reviews; no personal identifiers, originals,
// private ratings, scoring, badges, payments, or moderation writes.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const MIN_APPROVED = 1; // Each customer contributes at most one approved review per product.
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
    // Legacy Testing fixtures can contain numeric slot values rather than
    // descriptive questionnaire choices; never publish those as insights.
    if (!value || value==="Not Applicable" || /^[0-9]+$/.test(value.trim())) continue;
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
  // The secret API key is NOT a JWT. Use it only as the server-side apikey
  // header; older supabase-js clients forward it as Authorization, causing
  // intermittent PostgREST 401/PGRST303 and hiding otherwise valid ratings.
  // Never expose this key or any individual review fields to the browser.
  const rows:(Answers & {points_raw:number|null})[]=[];
  for(let page=0;page<MAX_PAGES;page++){
    const endpoint=new URL("/rest/v1/pj_review_submissions",url);
    endpoint.searchParams.set("select","q10,q11,q12,q13,points_raw");
    endpoint.searchParams.set("product_slug_snapshot","eq."+slug);
    endpoint.searchParams.set("moderation_status","eq.approved");
    endpoint.searchParams.set("offset",String(page*PAGE_SIZE));
    endpoint.searchParams.set("limit",String(PAGE_SIZE));
    let response:Response;
    try {
      response=await fetch(endpoint,{headers:{apikey:key,accept:"application/json"}});
    } catch {return reply({error:"NOTES_UNAVAILABLE"},503);}
    if(!response.ok)return reply({error:"NOTES_UNAVAILABLE"},503);
    let batch:(Answers & {points_raw:number|null})[];
    try {batch=await response.json();} catch {return reply({error:"NOTES_UNAVAILABLE"},503);}
    if(!Array.isArray(batch))return reply({error:"NOTES_UNAVAILABLE"},503);
    rows.push(...batch);
    if(batch.length<PAGE_SIZE)break;
    if(page===MAX_PAGES-1)return reply({error:"NOTES_LIMIT_REACHED"},503);
  }
  if(rows.length<MIN_APPROVED)return reply({available:false});
  // Approved 6–18-point original-review system, mapped to a 3–5 star scale.
  // Average raw scores before converting and quarter-round exactly once.
  // Never expose individual scoring values or questionnaire responses.
  const scores=rows.map(r=>r.points_raw);
  const scoresValid=scores.every(v=>Number.isInteger(v)&&Number(v)>=6&&Number(v)<=18);
  const mean=scoresValid?rows.reduce((sum,r)=>sum+Number(r.points_raw),0)/rows.length:null;
  const rating=mean===null?null:Math.round((3+(mean-6)/6)*4)/4;
  const food=winner(rows.map(r=>r.q10==="Snack"?"Snacking":r.q10||""));
  const flavor=winner(rows.flatMap(r=>[...new Set(Array.isArray(r.q11)?r.q11:[])]));
  return reply({
    available:true,
    rating,
    count:rows.length,
    cards:{
      arrival:winner(rows.map(r=>r.q12||"")),
      finish:winner(rows.map(r=>r.q13||"")),
      food,
      flavor
    }
  });
});
