import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SQUARE_BASE_URL = "https://connect.squareup.com";
const SQUARE_VERSION = "2026-09-16";

type Money = { amount?: number; currency?: string };
type Tender = { payment_id?: string; customer_id?: string };
type Address = { administrative_district_level_1?: string; country?: string };
type Fulfillment = { shipment_details?: { recipient?: { address?: Address } } };
type Line = {
  uid?: string;
  catalog_object_id?: string;
  catalog_version?: number;
  quantity?: string;
  name?: string;
  variation_name?: string;
  base_price_money?: Money;
  total_money?: Money;
};
type Order = {
  id?: string;
  customer_id?: string;
  location_id?: string;
  state?: string;
  created_at?: string;
  updated_at?: string;
  closed_at?: string;
  total_money?: Money;
  tenders?: Tender[];
  line_items?: Line[];
  fulfillments?: Fulfillment[];
};
type CatalogObject = {
  type?: string;
  id?: string;
  item_variation_data?: { item_id?: string };
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function serviceRoleAuthorized(authHeader: string | null, apiKeyHeader: string | null) {
  const presented = new Set<string>();
  if (authHeader?.startsWith("Bearer ")) presented.add(authHeader.slice(7));
  if (apiKeyHeader) presented.add(apiKeyHeader);

  const candidates = new Set<string>();
  for (const name of ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"]) {
    const value = Deno.env.get(name);
    if (value) candidates.add(value);
  }

  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    try {
      const stack: unknown[] = [JSON.parse(raw)];
      while (stack.length) {
        const current = stack.pop();
        if (typeof current === "string") candidates.add(current);
        else if (Array.isArray(current)) stack.push(...current);
        else if (current && typeof current === "object") {
          stack.push(...Object.values(current as Record<string, unknown>));
        }
      }
    } catch {
      return false;
    }
  }

  for (const value of presented) {
    if (candidates.has(value)) return true;
  }
  return false;
}

async function squareGet(path: string, token: string) {
  const res = await fetch(SQUARE_BASE_URL + path, {
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      "Square-Version": SQUARE_VERSION,
    },
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Square " + path + " failed (" + res.status + "): " + JSON.stringify(payload));
  return payload;
}

async function squarePost(path: string, token: string, body: unknown) {
  const res = await fetch(SQUARE_BASE_URL + path, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      "Square-Version": SQUARE_VERSION,
    },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Square " + path + " failed (" + res.status + "): " + JSON.stringify(payload));
  return payload;
}

function chunks<T>(values: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

function shippingDestination(order: Order) {
  for (const f of order.fulfillments ?? []) {
    const a = f.shipment_details?.recipient?.address;
    if (a?.administrative_district_level_1 || a?.country) {
      return {
        destination_region: a.administrative_district_level_1 ?? null,
        destination_country_code: a.country ?? null,
      };
    }
  }
  return { destination_region: null, destination_country_code: null };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!serviceRoleAuthorized(req.headers.get("Authorization"), req.headers.get("apikey"))) {
    return json({ error: "Service-role authorization required" }, 403);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const squareToken = Deno.env.get("SQUARE_PRODUCTION_ACCESS_TOKEN");
  const squareLocationId = Deno.env.get("SQUARE_PEPPER_JUNCTION_LOCATION_ID");

  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Supabase environment incomplete" }, 500);
  if (!squareToken || !squareLocationId) return json({ error: "Square production transaction intake is not configured" }, 503);

  const body = await req.json().catch(() => ({}));
  const orderIdInput = typeof body?.square_order_id === "string" ? body.square_order_id : null;
  const paymentIdInput = typeof body?.square_payment_id === "string" ? body.square_payment_id : null;
  const sourceMode = body?.source_mode === "reconciliation" ? "reconciliation" : "webhook";

  if (!orderIdInput && !paymentIdInput) {
    return json({ error: "square_order_id or square_payment_id is required" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let runId: string | null = null;

  try {
    let payment: any = null;
    let orderId = orderIdInput;

    if (paymentIdInput) {
      const payload = await squareGet("/v2/payments/" + encodeURIComponent(paymentIdInput), squareToken);
      payment = payload?.payment;
      if (!payment?.id) throw new Error("Square payment response did not include payment");
      if (payment.status !== "COMPLETED") {
        return json({ status: "ignored", reason: "square_payment_not_completed" });
      }
      orderId = orderId ?? payment.order_id ?? null;
    }

    if (!orderId) return json({ status: "ignored", reason: "square_order_id_unavailable" });

    const orderPayload = await squareGet("/v2/orders/" + encodeURIComponent(orderId), squareToken);
    const order = orderPayload?.order as Order | undefined;

    if (!order?.id) throw new Error("Square order response did not include order");
    if (order.state !== "COMPLETED") {
      return json({ status: "ignored", reason: "square_order_not_completed" });
    }
    if (order.location_id && order.location_id !== squareLocationId) {
      return json({ status: "ignored", reason: "different_square_location" });
    }

    const paymentIds = Array.from(new Set(
      (order.tenders ?? [])
        .map((t) => t.payment_id)
        .filter((v): v is string => typeof v === "string" && v.length > 0)
    ));

    if (paymentIdInput && paymentIds.length > 0 && !paymentIds.includes(paymentIdInput)) {
      throw new Error("Square payment does not belong to the confirmed order");
    }

    const candidateSquareCustomerIds = Array.from(new Set([
      order.customer_id,
      payment?.customer_id,
      ...(order.tenders ?? []).map((t) => t.customer_id),
    ].filter((v): v is string => typeof v === "string" && v.length > 0)));

    if (candidateSquareCustomerIds.length === 0) {
      return json({ status: "ignored", reason: "no_square_customer_identity" });
    }

    const { data: links, error: linkError } = await admin
      .from("square_customer_links")
      .select("customer_id, square_customer_id, is_active, is_historical_alias")
      .in("square_customer_id", candidateSquareCustomerIds);

    if (linkError) throw new Error("Unable to read accepted Square identity links");

    const acceptedLinks = (links ?? []).filter(
      (r: any) => r.is_active === true || r.is_historical_alias === true
    );

    const pjCustomerIds = Array.from(new Set(
      acceptedLinks.map((r: any) => r.customer_id).filter((v: unknown): v is string => typeof v === "string")
    ));

    if (pjCustomerIds.length === 0) {
      return json({ status: "ignored", reason: "no_verified_pj_identity_link" });
    }
    if (pjCustomerIds.length > 1) {
      return json({ status: "blocked", reason: "square_identity_candidates_span_multiple_pj_customers" }, 409);
    }

    const customerId = pjCustomerIds[0];
    const acceptedSquareIdsForCustomer = new Set(
      acceptedLinks
        .filter((r: any) => r.customer_id === customerId)
        .map((r: any) => r.square_customer_id)
    );
    const matchedSquareCustomerId = [
      order.customer_id,
      payment?.customer_id,
      ...(order.tenders ?? []).map((t) => t.customer_id),
    ].find((v): v is string => typeof v === "string" && acceptedSquareIdsForCustomer.has(v));

    if (!matchedSquareCustomerId) {
      return json({ status: "ignored", reason: "square_order_did_not_reconfirm_accepted_identity" });
    }

    const { data: profile, error: profileError } = await admin
      .from("customer_profiles")
      .select("id, account_state")
      .eq("id", customerId)
      .maybeSingle();

    if (profileError) throw new Error("Unable to read PJ customer state");
    if (!profile || profile.account_state !== "verified_matched") {
      return json({ status: "ignored", reason: "pj_customer_not_verified_matched" });
    }

    const catalogIds = Array.from(new Set(
      (order.line_items ?? [])
        .map((l) => l.catalog_object_id)
        .filter((v): v is string => typeof v === "string" && v.length > 0)
    ));

    const catalogById = new Map<string, CatalogObject>();
    for (const batch of chunks(catalogIds, 100)) {
      const payload = await squarePost("/v2/catalog/batch-retrieve", squareToken, {
        object_ids: batch,
        include_related_objects: false,
      });
      for (const obj of (payload.objects ?? []) as CatalogObject[]) {
        if (obj.id) catalogById.set(obj.id, obj);
      }
    }

    const { data: mappings, error: mappingsError } = await admin
      .from("square_product_mappings")
      .select("product_id, square_item_library_token");
    if (mappingsError) throw new Error("Unable to read PJ-to-Square product mappings");

    const productBySquareToken = new Map<string, string>();
    for (const m of mappings ?? []) productBySquareToken.set(m.square_item_library_token, m.product_id);

    const productIds = Array.from(new Set((mappings ?? []).map((m: any) => m.product_id)));
    const slugByProductId = new Map<string, string>();
    if (productIds.length) {
      const { data: products, error: productsError } = await admin
        .from("pj_products")
        .select("id, cns_slug")
        .in("id", productIds);
      if (productsError) throw new Error("Unable to read PJ product identities");
      for (const p of products ?? []) slugByProductId.set(p.id, p.cns_slug);
    }

    const normalizedLines: any[] = [];

    for (const line of order.line_items ?? []) {
      if (!line.uid) throw new Error("Current Square order contains a line without a stable line UID");

      const quantity = Number(line.quantity);
      const lineTotalCents = line.total_money?.amount;
      if (!Number.isFinite(quantity) || quantity <= 0 || typeof lineTotalCents !== "number" || lineTotalCents < 0) {
        throw new Error("Current Square order contains an invalid line item");
      }

      const catalogId = line.catalog_object_id ?? null;
      const catalog = catalogId ? catalogById.get(catalogId) : undefined;

      let squareItemId: string | null = null;
      let squareVariationId: string | null = null;
      let mappingToken: string | null = null;

      if (catalog?.type === "ITEM_VARIATION") {
        squareVariationId = catalog.id ?? catalogId;
        squareItemId = catalog.item_variation_data?.item_id ?? null;
        mappingToken = squareItemId ?? squareVariationId;
      } else if (catalog?.type === "ITEM") {
        squareItemId = catalog.id ?? catalogId;
        mappingToken = squareItemId;
      } else if (catalogId) {
        mappingToken = catalogId;
      }

      const variationProduct = squareVariationId ? productBySquareToken.get(squareVariationId) : undefined;
      const parentProduct = squareItemId ? productBySquareToken.get(squareItemId) : undefined;
      const directProduct = catalogId ? productBySquareToken.get(catalogId) : undefined;
      const matches = [...new Set([variationProduct,parentProduct,directProduct].filter((id): id is string => Boolean(id)))];
      if (matches.length > 1) throw new Error("Conflicting Square-to-CNS product mapping");
      const productId = matches[0] ?? null;
      if (!productId) {
        throw new Error("Current Square order contains a product without a valid current PJ/CNS mapping");
      }

      normalizedLines.push({
        product_id: productId,
        square_catalog_object_id: catalogId,
        square_item_id: squareItemId,
        square_variation_id: squareVariationId,
        square_line_item_uid: line.uid,
        cns_slug_snapshot: slugByProductId.get(productId) ?? null,
        quantity,
        unit_amount: typeof line.base_price_money?.amount === "number" ? line.base_price_money.amount / 100 : null,
        line_total_amount: lineTotalCents / 100,
        currency_code: line.total_money?.currency ?? order.total_money?.currency ?? "USD",
        pj_credits_rate_snapshot: null,
        classification_snapshot: null,
        source_product_snapshot: {
          square_name: line.name ?? null,
          square_variation_name: line.variation_name ?? null,
          catalog_object_id: catalogId,
          catalog_version: line.catalog_version ?? null,
          mapping_status: "mapped",
        },
      });
    }

    if (normalizedLines.length === 0) throw new Error("Current Square order has no mapped PJ product lines");

    const totalAmountCents = order.total_money?.amount;
    if (typeof totalAmountCents !== "number" || totalAmountCents < 0) {
      throw new Error("Square order total is invalid");
    }

    const { data: run, error: runError } = await admin
      .from("purchase_import_runs")
      .insert({
        customer_id: customerId,
        import_mode: sourceMode,
        status: "running",
        square_customer_ids: candidateSquareCustomerIds,
      })
      .select("id")
      .single();

    if (runError || !run) throw new Error("Unable to start current transaction intake run");
    runId = run.id;

    const destination = shippingDestination(order);

    const { data: recorded, error: recordError } = await admin.rpc("record_square_purchase", {
      p_import_run_id: run.id,
      p_customer_id: customerId,
      p_square_customer_id: matchedSquareCustomerId,
      p_order: {
        square_order_id: order.id,
        square_payment_id: paymentIds.length === 1 ? paymentIds[0] : null,
        square_payment_ids: paymentIds,
        square_location_id: order.location_id ?? squareLocationId,
        total_amount: totalAmountCents / 100,
        currency_code: order.total_money?.currency ?? "USD",
        completed_at: order.closed_at ?? order.updated_at ?? null,
        square_created_at: order.created_at ?? null,
        square_updated_at: order.updated_at ?? null,
        source_channel: sourceMode,
        ...destination,
      },
      p_lines: normalizedLines,
    });

    if (recordError) throw new Error("Atomic purchase record failed: " + recordError.message);
    if (recorded?.result === "conflict") {
      await admin.from("purchase_import_runs").update({
        status: "blocked",
        transactions_seen: 1,
        transactions_blocked: 1,
        completed_at: new Date().toISOString(),
        error_summary: "Square transaction ownership conflict",
      }).eq("id", run.id);
      return json({ status: "blocked", reason: "transaction_owned_by_another_customer" }, 409);
    }

    const purchaseId = recorded?.purchase_id;
    if (typeof purchaseId !== "string") throw new Error("Purchase recorder did not return a purchase ID");

    await admin.from("purchase_import_runs").update({
      status: "succeeded",
      transactions_seen: 1,
      transactions_inserted: recorded?.result === "inserted" ? 1 : 0,
      transactions_refreshed: recorded?.result === "refreshed" ? 1 : 0,
      transactions_failed: 0,
      completed_at: new Date().toISOString(),
      error_summary: null,
    }).eq("id", run.id);

    return json({
      status: "succeeded",
      result: recorded?.result,
      purchase_id: purchaseId,
      customer_id: customerId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (runId) {
      await admin.from("purchase_import_runs").update({
        status: "failed",
        transactions_seen: 1,
        transactions_failed: 1,
        completed_at: new Date().toISOString(),
        error_summary: message,
      }).eq("id", runId);
    }

    return json({ error: "Current Square transaction intake failed", detail: message }, 502);
  }
});
