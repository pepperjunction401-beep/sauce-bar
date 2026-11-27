import { commercialDiagnostic } from "./diagnostic.js";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://pepperjunction401-beep.github.io",
  "https://pepperjunction401.com",
  "https://www.pepperjunction401.com",
]);

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...corsHeaders(req.headers.get("Origin")),
    },
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");

  if (req.method === "OPTIONS") {
    if (!origin || !ALLOWED_ORIGINS.has(origin)) {
      return new Response(null, { status: 403 });
    }
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return json(req, { error: "Origin not allowed" }, 403);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return json(req, { error: "Commercial state service is not configured" }, 503);
  }

  const body = await req.json().catch(() => ({}));
  const rawIds = Array.isArray(body?.product_ids) ? body.product_ids : [];

  const productIds = Array.from(new Set(
    rawIds
      .filter((v: unknown): v is string => typeof v === "string")
      .map((v: string) => v.trim())
      .filter((v: string) => v.length > 0 && v.length <= 200)
  ));

  if (productIds.length < 1 || productIds.length > 50) {
    return json(req, { error: "product_ids must contain between 1 and 50 items" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: products, error: productsError } = await admin
    .from("pj_products")
    .select("id,cns_slug,is_active")
    .in("cns_slug", productIds);

  if (productsError) {
    console.error(JSON.stringify(commercialDiagnostic("pj_products", productsError, productIds, new Date().toISOString())));
    return json(req, { error: "Unable to read product state" }, 500);
  }

  const rows = products ?? [];
  const ids = rows.map((p: any) => p.id);

  const { data: states, error: statesError } = ids.length
    ? await admin
        .from("product_commercial_state")
        .select("product_id,price_amount,currency_code,sync_status,square_location_enabled,square_archived,square_sold_out,availability_status")
        .in("product_id", ids)
    : { data: [], error: null };

  if (statesError) {
    console.error(JSON.stringify(commercialDiagnostic("product_commercial_state", statesError, productIds, new Date().toISOString())));
    return json(req, { error: "Unable to read commercial state" }, 500);
  }

  const stateByProduct = new Map((states ?? []).map((s: any) => [s.product_id, s]));

  const items = rows.map((p: any) => {
    const s: any = stateByProduct.get(p.id) ?? null;
    const current =
      p.is_active === true &&
      s &&
      s.sync_status === "current" &&
      s.square_location_enabled === true &&
      s.square_archived !== true;

    const available =
      current &&
      s.square_sold_out !== true &&
      (!s.availability_status || s.availability_status === "available");

    return {
      product_id: p.cns_slug,
      price: current && s.price_amount !== null ? Number(s.price_amount) : null,
      currency_code: current ? (s.currency_code ?? "USD") : null,
      available: Boolean(available),
      current: Boolean(current),
    };
  });

  return json(req, { items });
});
