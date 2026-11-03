// Pepper Junction — checkout-specific award presentation (TESTING).
// This endpoint reads existing award evidence. It NEVER evaluates or awards badges.
// Only a verified Supabase Auth user can retrieve their own completed purchase.
// Checkout attribution is by trusted purchase-id foreign keys, never timestamps.
// Families lacking reliable checkout linkage are intentionally omitted.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { projectCloseCalls } from "./progress.js";

const allowedOrigins = new Set([
  "https://pepperjunction401.com",
  "https://www.pepperjunction401.com",
  "https://pepperjunction401-beep.github.io"
]);
const orderPattern = /^[A-Za-z0-9_-]{8,80}$/;
const familyTables = [
  { family: "heat_identity", table: "pj_customer_badge_awards", purchaseKey: "source_purchase_id", select: "badge_code,award_state,reversed_at" },
  { family: "food", table: "pj_food_badge_level_awards", purchaseKey: "source_purchase_id", select: "badge_code,earned_level" },
  { family: "purchase_progress", table: "pj_purchase_progress_award_events", purchaseKey: "purchase_id", select: "badge_code,earned_level" },
  { family: "celestial", table: "pj_celestial_awards", purchaseKey: "source_purchase_id", select: "edition_year,month_number" },
  { family: "round_clock", table: "pj_round_clock_award_events", purchaseKey: "purchase_id", select: "window_code,reversed_at" }
] as const;

function pretty(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase()).slice(0, 120);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  const cors = origin && allowedOrigins.has(origin)
    ? { "Access-Control-Allow-Origin": origin } : {};
  const headers = {
    ...cors,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "private, no-store",
    "Vary": "Origin"
  };
  const reply = (body: unknown, code = 200) =>
    new Response(JSON.stringify(body), { status: code, headers });
  if (origin && !allowedOrigins.has(origin)) return reply({ error: "Origin not allowed" }, 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  if (!(req.headers.get("Content-Type") || "").toLowerCase().startsWith("application/json")) {
    return reply({ error: "Expected JSON" }, 415);
  }

  const authorization = req.headers.get("Authorization") || "";
  const match = /^Bearer\s+(\S+)$/i.exec(authorization);
  if (!match) return reply({ error: "Authentication required" }, 401);

  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 2048) return reply({ error: "Request too large" }, 413);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error("Invalid JSON");
    body = parsed;
  } catch (_) {
    return reply({ error: "Invalid request body" }, 400);
  }
  const order = body.square_order_id;
  if (typeof order !== "string" || !orderPattern.test(order)) {
    return reply({ error: "Invalid Square order reference" }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return reply({ error: "Service unavailable" }, 503);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  // Server-verification: never accept customer_id from the request body.
  const { data: authData, error: authError } = await admin.auth.getUser(match[1]);
  const user = authData?.user;
  if (authError || !user || user.is_anonymous === true) {
    return reply({ error: "Authentication required" }, 401);
  }

  try {
    const { data: profile, error: profileError } = await admin
      .from("customer_profiles").select("id,account_state")
      .eq("id", user.id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile || profile.account_state !== "verified_matched") {
      return reply({ error: "Verified customer account required" }, 403);
    }

    // An unowned order, a nonexistent order and an order awaiting ingestion
    // produce the SAME response, preventing cross-customer order enumeration.
    const event = { type: "checkout", id: order };
    const { data: purchase, error: purchaseError } = await admin
      .from("purchases")
      .select("id,customer_id,square_order_id,purchase_status,import_status")
      .eq("customer_id", user.id).eq("square_order_id", order).maybeSingle();
    if (purchaseError) throw purchaseError;
    if (!purchase || purchase.purchase_status !== "completed" ||
        purchase.import_status !== "attached") {
      return reply({ status: "pending", event, awards: [], nearMisses: [] });
    }

    // Cap reads; refuse incomplete results instead of silently truncating.
    const read = async (table: string, fields: string, column: string, value: string) => {
      const { data, error } = await admin.from(table).select(fields)
        .eq(column, value).eq("customer_id", user.id).limit(101);
      if (error) throw error;
      if (!data || data.length > 100) throw Error("Award results exceed safe limit");
      return data as Record<string, any>[];
    };

    const slices = await Promise.all(familyTables.map(spec =>
      read(spec.table, spec.select, spec.purchaseKey, purchase.id)
    ));
    const awards: Record<string, unknown>[] = [];
    const add = (family: string, code: string, title: string, level?: number) => {
      awards.push({
        family, code, title,
        attribution: event,
        ...(Number.isSafeInteger(level) && (level as number) > 0 ? { level } : {}),
        label: pretty(family),
        major: false,
        sound: false
      });
    };

    for (let i = 0; i < familyTables.length; i++) {
      const family = familyTables[i].family;
      for (const row of slices[i]) {
        if (family === "heat_identity") {
          if (row.reversed_at || row.award_state === "reversed") continue;
          add(family, String(row.badge_code), pretty(String(row.badge_code)));
        } else if (family === "food" || family === "purchase_progress") {
          add(family, String(row.badge_code), pretty(String(row.badge_code)), Number(row.earned_level));
        } else if (family === "celestial") {
          const year = Number(row.edition_year);
          const month = Number(row.month_number);
          if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) continue;
          const title = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" })
            .format(new Date(Date.UTC(2020, month - 1, 1))) + " " + year;
          add(family, year + "-" + String(month).padStart(2, "0"), title);
        } else if (family === "round_clock") {
          if (row.reversed_at) continue;
          add(family, String(row.window_code), pretty(String(row.window_code)));
        }
      }
    }

    // Bottle Coin events are session-linked rather than directly purchase-linked.
    // Attribute only single-purchase finalized sessions. Multi-purchase sessions
    // require an additional authoritative finalization-event correlation.
    const { data: memberships, error: membershipError } = await admin
      .from("pj_bottle_coin_session_purchases").select("session_id")
      .eq("purchase_id", purchase.id).limit(101);
    if (membershipError) throw membershipError;
    if (!memberships || memberships.length > 100) throw Error("Coin session results exceed safe limit");

    for (const m of memberships) {
      const sessionId = m.session_id;
      const { data: session, error: sessionError } = await admin
        .from("pj_bottle_coin_sessions").select("id,status")
        .eq("id", sessionId).eq("customer_id", user.id).maybeSingle();
      if (sessionError) throw sessionError;
      if (!session || session.status !== "finalized") continue;
      const { data: members, error: membersError } = await admin
        .from("pj_bottle_coin_session_purchases").select("purchase_id")
        .eq("session_id", sessionId).limit(2);
      if (membersError) throw membersError;
      if (!members || members.length !== 1 || members[0].purchase_id !== purchase.id) continue;
      const coins = await read("pj_bottle_coin_award_events",
        "coin_code,earned_level", "session_id", sessionId);
      for (const coin of coins) {
        add("bottle_coin", String(coin.coin_code),
          pretty(String(coin.coin_code)), Number(coin.earned_level));
      }
    }

    // Read-only contribution evidence and existing definitions.
    // Never call an award evaluator or reconstruct a new award.
    const readList = async (table: string, fields: string, options: {
      customer?: boolean; field?: string; value?: string; active?: boolean;
    }, limit = 1000) => {
      let query = admin.from(table).select(fields).limit(limit + 1);
      if (options.customer) query = query.eq("customer_id", user.id);
      if (options.field && options.value) query = query.eq(options.field, options.value);
      if (options.active) query = query.eq("is_active", true);
      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length > limit) throw Error("Incomplete progress evidence");
      return data as Record<string, any>[];
    };
    const [
      heatRows, foodRows, heatDefinitions, foodDefinitions,
      heatEarned, foodLevels, progressEvents, progressDefinitions
    ] = await Promise.all([
      readList("pj_heat_purchase_contributions", "purchase_id,heat_category,net_eligible_quantity", { customer: true }),
      readList("pj_food_purchase_contributions", "purchase_id,badge_code,net_eligible_quantity", { customer: true }),
      readList("pj_badge_definitions", "badge_code,heat_category,badge_level,qualifying_quantity", { active: true }, 100),
      readList("pj_food_badge_definitions", "badge_code,food_category,badge_title,items_per_level", { active: true }, 100),
      readList("pj_customer_badge_awards", "badge_code,award_state,reversed_at", { customer: true }),
      readList("pj_customer_food_badge_levels", "badge_code,earned_level", { customer: true }),
      readList("pj_purchase_progress_award_events", "purchase_id,badge_code,qualifying_amount,net_progress",
        { customer: true, field: "purchase_id", value: purchase.id }, 100),
      readList("pj_purchase_progress_definitions", "badge_code,badge_title,threshold_amount", { active: true }, 100)
    ]);
    const nearMisses = projectCloseCalls({
      event, purchaseId: purchase.id,
      heatRows, foodRows, heatDefinitions, foodDefinitions,
      earnedHeatCodes: new Set(heatEarned.filter(r => r.award_state === "earned" && !r.reversed_at).map(r => r.badge_code)),
      earnedFoodLevels: new Map(foodLevels.map(r => [r.badge_code, Number(r.earned_level)])),
      progressEvents, progressDefinitions
    });

    // Intentionally omitted: Passenger Tokens, Milestone, and secret awards.
    // Their current award records do not prove which checkout earned them.
    // No timestamp guessing or eligibility-engine calls are permitted.
    return reply({
      status: "ready", event, awards, nearMisses,
      snapshot_at: new Date().toISOString()
    });
  } catch (error) {
    // No internal database details, user info, or access token in responses/logs.
    console.error("post-payment-awards-read failed", error instanceof Error ? error.name : "unknown");
    return reply({ error: "Awards temporarily unavailable" }, 503);
  }
});
