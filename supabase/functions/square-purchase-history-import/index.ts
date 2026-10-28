import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveSquareProduct } from "../_shared/square-product-identity.ts";
import { lookupCnsProduct } from "../_shared/cns-product-snapshot.ts";
import { fullyPaidOpenSquareOrder, squarePaymentIds } from "../_shared/square-payment-evidence.ts";

const SQUARE_BASE_URL = "https://connect.squareup.com";
const SQUARE_VERSION = "2026-09-16";

type SquareMoney = { amount?: number; currency?: string };
type SquareTender = { payment_id?: string; customer_id?: string };
type SquarePayment = { id?: string; order_id?: string; customer_id?: string; location_id?: string; status?: string; created_at?: string; updated_at?: string; amount_money?: SquareMoney; total_money?: SquareMoney };
type SquareAddress = { administrative_district_level_1?: string; country?: string };
type SquareFulfillment = { shipment_details?: { recipient?: { address?: SquareAddress } } };
type SquareLine = {
  uid?: string;
  catalog_object_id?: string;
  catalog_version?: number;
  quantity?: string;
  name?: string;
  variation_name?: string;
  base_price_money?: SquareMoney;
  total_money?: SquareMoney;
};
type SquareOrder = {
  id?: string;
  customer_id?: string;
  location_id?: string;
  state?: string;
  created_at?: string;
  updated_at?: string;
  closed_at?: string;
  total_money?: SquareMoney;
  tenders?: SquareTender[];
  line_items?: SquareLine[];
  fulfillments?: SquareFulfillment[];
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

async function serviceRoleAuthorized(authHeader: string | null, apiKeyHeader: string | null, supabaseUrl: string, serviceRoleKey: string): Promise<boolean> {
  const presented = new Set<string>();
  if (authHeader?.startsWith("Bearer ")) presented.add(authHeader.slice(7).trim());
  if (apiKeyHeader) presented.add(apiKeyHeader.trim());

  // Fast path for an exact match to a configured server-side administrative key.
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
        const item = stack.pop();
        if (typeof item === "string") candidates.add(item);
        else if (Array.isArray(item)) stack.push(...item);
        else if (item && typeof item === "object") stack.push(...Object.values(item));
      }
    } catch {
      return false;
    }
  }
  for (const credential of presented) {
    if (candidates.has(credential)) return true;
  }

  // Supabase's Auth admin endpoint cryptographically validates a presented
  // legacy service_role JWT. Do not trust decoded, unsigned role claims.
  // A server-only key supplies the apikey header; the CALLER'S JWT is the
  // authorization under test. Fail closed on any error or non-200 response.
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!bearer) return false;
  try {
    const response = await fetch(supabaseUrl + "/auth/v1/admin/users?page=1&per_page=1", {
      method: "GET",
      headers: {
        "apikey": serviceRoleKey,
        "Authorization": "Bearer " + bearer,
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(7000),
    });
    return response.ok;
  } catch {
    return false;
  }
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
  if (!res.ok) {
    throw new Error("Square " + path + " failed (" + res.status + "): " + JSON.stringify(payload));
  }
  return payload;
}

async function squareGet(path: string, token: string) {
  const res = await fetch(SQUARE_BASE_URL + path, {
    headers: { Authorization: "Bearer " + token, "Square-Version": SQUARE_VERSION },
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Square " + path.split("?")[0] + " failed (" + res.status + ")");
  return payload;
}

function chunks<T>(values: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

function shippingDestination(order: SquareOrder) {
  for (const f of order.fulfillments ?? []) {
    const address = f.shipment_details?.recipient?.address;
    if (address?.administrative_district_level_1 || address?.country) {
      return {
        destination_region: address.administrative_district_level_1 ?? null,
        destination_country_code: address.country ?? null,
      };
    }
  }
  return { destination_region: null, destination_country_code: null };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const squareToken = Deno.env.get("SQUARE_PRODUCTION_ACCESS_TOKEN");
  const squareLocationId = Deno.env.get("SQUARE_PEPPER_JUNCTION_LOCATION_ID");

  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Supabase environment incomplete" }, 500);
  if (!(await serviceRoleAuthorized(req.headers.get("Authorization"), req.headers.get("apikey"), supabaseUrl, serviceRoleKey))) return json({ error: "Service-role authorization required" }, 403);
  // A Testing function may not silently use a Production Supabase URL.
  const functionHost = new URL(req.url).hostname;
  const configuredHost = new URL(supabaseUrl).hostname;
  if (!/^[a-z0-9]+[.]supabase[.]co$/.test(functionHost) || configuredHost !== functionHost) {
    return json({ error: "Supabase project environment mismatch; import refused" }, 503);
  }
  if (!squareToken || !squareLocationId) {
    return json({ error: "Square production transaction import is not configured" }, 503);
  }

  const body = await req.json().catch(() => ({}));
  const customerId = typeof body?.customer_id === "string" ? body.customer_id : null;
  if (!customerId) return json({ error: "customer_id is required" }, 400);

  const historyReason = typeof body?.history_reason === "string"
    ? body.history_reason
    : "bootstrap";
  const allowedHistoryReasons = new Set([
    "bootstrap",
    "failed_retry",
    "identity_correction",
    "new_alias",
    "repair",
  ]);
  if (!allowedHistoryReasons.has(historyReason)) {
    return json({ error: "history_reason is invalid" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profile, error: profileError } = await admin
    .from("customer_profiles")
    .select("id, account_state")
    .eq("id", customerId)
    .maybeSingle();

  if (profileError) return json({ error: "Unable to read customer identity state" }, 500);
  if (!profile) return json({ error: "Customer not found" }, 404);

  if (profile.account_state === "verified_matched") {
    const { data: priorSuccess, error: priorSuccessError } = await admin
      .from("purchase_import_runs")
      .select("id, completed_at")
      .eq("customer_id", customerId)
      .eq("import_mode", "history_import")
      .eq("status", "succeeded")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (priorSuccessError) {
      return json({ error: "Unable to read prior history import state" }, 500);
    }

    if (priorSuccess && historyReason === "bootstrap") {
      return json({
        status: "blocked",
        reason: "history_bootstrap_already_completed",
        prior_import_run_id: priorSuccess.id,
      }, 409);
    }

    if (historyReason === "failed_retry") {
      const { data: priorRetryable, error: priorRetryableError } = await admin
        .from("purchase_import_runs")
        .select("id")
        .eq("customer_id", customerId)
        .eq("import_mode", "history_import")
        .in("status", ["failed", "partial_error"])
        .limit(1)
        .maybeSingle();

      if (priorRetryableError) {
        return json({ error: "Unable to read retryable history import state" }, 500);
      }
      if (!priorRetryable) {
        return json({ status: "blocked", reason: "no_failed_history_import_to_retry" }, 409);
      }
    }
  }

  if (profile.account_state !== "verified_matched") {
    const { data: blockedRun } = await admin
      .from("purchase_import_runs")
      .insert({
        customer_id: customerId,
        import_mode: "history_import",
        history_reason: historyReason,
        status: "blocked",
        transactions_blocked: 1,
        completed_at: new Date().toISOString(),
        error_summary: "Phase 1 identity state is not verified_matched",
      })
      .select("id")
      .single();

    return json({
      status: "blocked",
      reason: "Customer is not Phase 1 verified_matched",
      import_run_id: blockedRun?.id ?? null,
    }, 409);
  }

  const { data: linkRows, error: linksError } = await admin
    .from("square_customer_links")
    .select("square_customer_id, is_active, is_historical_alias")
    .eq("customer_id", customerId);

  if (linksError) return json({ error: "Unable to read accepted Square identities" }, 500);

  const acceptedIds = Array.from(new Set(
    (linkRows ?? [])
      .filter((r: any) => r.is_active === true || r.is_historical_alias === true)
      .map((r: any) => r.square_customer_id)
      .filter((v: unknown): v is string => typeof v === "string" && v.length > 0)
  ));

  if (acceptedIds.length === 0) {
    const { data: blockedRun } = await admin
      .from("purchase_import_runs")
      .insert({
        customer_id: customerId,
        import_mode: "history_import",
        history_reason: historyReason,
        status: "blocked",
        square_customer_ids: [],
        transactions_blocked: 1,
        completed_at: new Date().toISOString(),
        error_summary: "No accepted Square customer identity is available",
      })
      .select("id")
      .single();

    return json({
      status: "blocked",
      reason: "No accepted Square customer identity is available",
      import_run_id: blockedRun?.id ?? null,
    }, 409);
  }

  const { data: run, error: runError } = await admin
    .from("purchase_import_runs")
    .insert({
      customer_id: customerId,
      import_mode: "history_import",
      history_reason: historyReason,
      status: "running",
      square_customer_ids: acceptedIds,
    })
    .select("id")
    .single();

  if (runError || !run) return json({ error: "Unable to start purchase import run" }, 500);

  const finishRun = async (values: Record<string, unknown>) => {
    await admin.from("purchase_import_runs").update({
      ...values,
      completed_at: new Date().toISOString(),
    }).eq("id", run.id);
  };

  try {
    const ordersById = new Map<string, SquareOrder>();
    // Preserve the accepted Square ID used to retrieve each order.
    const discoveryCustomerByOrder = new Map<string, string>();

    for (const discoveryCustomerId of acceptedIds) {
      let cursor: string | undefined;
      do {
        const payload = await squarePost("/v2/orders/search", squareToken, {
          location_ids: [squareLocationId],
          return_entries: false,
          limit: 500,
          cursor,
          query: {
            filter: {
              customer_filter: { customer_ids: [discoveryCustomerId] },
              state_filter: { states: ["COMPLETED"] },
            },
            sort: { sort_field: "CLOSED_AT", sort_order: "ASC" },
          },
        });

        for (const order of (payload.orders ?? []) as SquareOrder[]) {
          if (order.id) {
            ordersById.set(order.id, order);
            if (!discoveryCustomerByOrder.has(order.id)) discoveryCustomerByOrder.set(order.id, discoveryCustomerId);
          }
        }
        cursor = payload.cursor || undefined;
      } while (cursor);
    }

    // Payment-backed history discovery: Square can leave a fully paid shipment
    // order OPEN and omit order.customer_id, while Payment.customer_id is correct.
    // This scans authoritative Square payments, not buyer-controlled data.
    // Refuse incomplete pagination rather than reporting a false success.
    const completedPaymentsByOrder = new Map<string, SquarePayment[]>();
    let paymentCursor: string | undefined;
    let pagesScanned = 0;
    do {
      if (++pagesScanned > 1000) throw new Error("Square payment discovery exceeded the safety page limit; no complete history claim");
      const params = new URLSearchParams({
        begin_time: "2013-01-01T00:00:00Z",
        end_time: new Date().toISOString(),
        limit: "100",
        sort_order: "DESC",
        location_id: squareLocationId,
      });
      if (paymentCursor) params.set("cursor", paymentCursor);
      const payload = await squareGet("/v2/payments?" + params.toString(), squareToken);
      for (const payment of (payload.payments ?? []) as SquarePayment[]) {
        if (payment.status !== "COMPLETED" || !payment.order_id || !payment.id) continue;
        if (!acceptedIds.includes(payment.customer_id ?? "")) continue;
        if (payment.location_id !== squareLocationId) continue;
        const items = completedPaymentsByOrder.get(payment.order_id) ?? [];
        if (!items.some((p) => p.id === payment.id)) items.push(payment);
        completedPaymentsByOrder.set(payment.order_id, items);
      }
      paymentCursor = payload.cursor || undefined;
    } while (paymentCursor);

    for (const [orderId, payments] of completedPaymentsByOrder) {
      if (ordersById.has(orderId)) continue;
      const payload = await squareGet("/v2/orders/" + encodeURIComponent(orderId), squareToken);
      const order = payload.order as SquareOrder | undefined;
      if (!order?.id || order.id !== orderId || order.location_id !== squareLocationId) continue;
      ordersById.set(orderId, order);
      // The accepted customer came from a Square-confirmed completed payment.
      discoveryCustomerByOrder.set(orderId, payments[0].customer_id!);
    }

    const orders = Array.from(ordersById.values());

    const catalogIds = Array.from(new Set(
      orders.flatMap((o) => (o.line_items ?? [])
        .map((l) => l.catalog_object_id)
        .filter((v): v is string => typeof v === "string" && v.length > 0))
    ));

    const catalogById = new Map<string, CatalogObject>();
    for (const catalogBatch of chunks(catalogIds, 100)) {
      const payload = await squarePost("/v2/catalog/batch-retrieve", squareToken, {
        object_ids: catalogBatch,
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
    for (const m of mappings ?? []) {
      productBySquareToken.set(m.square_item_library_token, m.product_id);
    }

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

    const acceptedSet = new Set(acceptedIds);
    let inserted = 0;
    let refreshed = 0;
    let skipped = 0;
    let blocked = 0;
    let failed = 0;
    let historicalProductLinesSkipped = 0;

    for (const order of orders) {
      const orderId = order.id!;
      // Square returned this completed-order candidate from a search explicitly
      // filtered by a previously accepted Phase 1 Square customer ID.
      // The order and its tenders need not independently repeat that ID.
      const matchedSquareCustomerId = discoveryCustomerByOrder.get(orderId);
      if (!matchedSquareCustomerId || !acceptedSet.has(matchedSquareCustomerId)) {
        blocked += 1;
        await admin.from("purchase_import_events").insert({
          import_run_id: run.id,
          square_order_id: orderId,
          event_result: "blocked",
          reason: "order_missing_accepted_search_provenance",
          safe_detail: "Order was not retrieved through an accepted Square customer search.",
        });
        continue;
      }

      const verifiedPayments = completedPaymentsByOrder.get(orderId) ?? [];
      // Existing COMPLETED-order discovery retains its established semantics.
      // An OPEN order qualifies ONLY when accepted-customer payments fully cover
      // the order total in the same currency; no partial-paid orders allowed.
      const fullyPaidOpenOrder = fullyPaidOpenSquareOrder({
        order,
        payments: verifiedPayments,
        acceptedCustomerId: matchedSquareCustomerId,
        requiredLocationId: squareLocationId,
      });
      if (order.state !== "COMPLETED" && !fullyPaidOpenOrder) {
        skipped += 1;
        await admin.from("purchase_import_events").insert({
          import_run_id: run.id,
          square_order_id: orderId,
          event_result: "skipped",
          reason: "square_order_not_completed",
        });
        continue;
      }

      const totalAmountCents = order.total_money?.amount;
      if (typeof totalAmountCents !== "number" || totalAmountCents < 0) {
        failed += 1;
        await admin.from("purchase_import_events").insert({
          import_run_id: run.id,
          square_order_id: orderId,
          event_result: "failed",
          reason: "square_order_total_invalid",
        });
        continue;
      }

      const paymentIds = squarePaymentIds(order.tenders, verifiedPayments);

      const destination = shippingDestination(order);
      const normalizedLines: any[] = [];
      let lineFailure = false;

      for (const line of order.line_items ?? []) {
        if (!line.uid) {
          lineFailure = true;
          break;
        }

        const quantity = Number(line.quantity);
        const lineTotalCents = line.total_money?.amount;
        if (!Number.isFinite(quantity) || quantity <= 0 || typeof lineTotalCents !== "number" || lineTotalCents < 0) {
          lineFailure = true;
          break;
        }

        const catalogId = line.catalog_object_id ?? null;
        const catalog = catalogId ? catalogById.get(catalogId) : undefined;

        const { squareItemId, squareVariationId, productId } = resolveSquareProduct(catalogId, catalog, productBySquareToken);
        const cnsSlug = productId ? (slugByProductId.get(productId) ?? null) : null;

        if (!productId) {
          historicalProductLinesSkipped += 1;
          continue;
        }

        const cnsData = lookupCnsProduct(cnsSlug, squareItemId);
        normalizedLines.push({
          product_id: productId,
          square_catalog_object_id: catalogId,
          square_item_id: squareItemId,
          square_variation_id: squareVariationId,
          square_line_item_uid: line.uid,
          cns_slug_snapshot: cnsSlug,
          quantity,
          unit_amount: typeof line.base_price_money?.amount === "number"
            ? line.base_price_money.amount / 100
            : null,
          line_total_amount: lineTotalCents / 100,
          currency_code: line.total_money?.currency ?? order.total_money?.currency ?? "USD",
          pj_credits_rate_snapshot: cnsData.pj_credits_rate_snapshot,
          classification_snapshot: cnsData.classification_snapshot,
          source_product_snapshot: {
            square_name: line.name ?? null,
            square_variation_name: line.variation_name ?? null,
            catalog_object_id: catalogId,
            catalog_version: line.catalog_version ?? null,
            mapping_status: "mapped",
          },
        });
      }

      if (lineFailure) {
        failed += 1;
        await admin.from("purchase_import_events").insert({
          import_run_id: run.id,
          square_order_id: orderId,
          event_result: "failed",
          reason: "invalid_line_item_shape",
        });
        continue;
      }

      if (normalizedLines.length === 0) {
        skipped += 1;
        await admin.from("purchase_import_events").insert({
          import_run_id: run.id,
          square_order_id: orderId,
          event_result: "skipped",
          reason: "historical_order_contains_no_current_cns_products",
          safe_detail: "Square-confirmed history was checked, but no line item mapped to an existing current Pepper Junction CNS/PJ product. Nothing from this order was imported.",
        });
        continue;
      }

      const { data: recorded, error: recordError } = await admin.rpc("record_square_purchase", {
        p_import_run_id: run.id,
        p_customer_id: customerId,
        p_square_customer_id: matchedSquareCustomerId,
        p_order: {
          square_order_id: orderId,
          square_payment_id: paymentIds.length === 1 ? paymentIds[0] : null,
          square_payment_ids: paymentIds,
          square_location_id: order.location_id ?? squareLocationId,
          total_amount: totalAmountCents / 100,
          currency_code: order.total_money?.currency ?? "USD",
          completed_at: fullyPaidOpenOrder ? (verifiedPayments[0].updated_at ?? verifiedPayments[0].created_at ?? null) : (order.closed_at ?? order.updated_at ?? null),
          square_created_at: order.created_at ?? null,
          square_updated_at: order.updated_at ?? null,
          ...destination,
        },
        p_lines: normalizedLines,
      });

      if (recordError) {
        failed += 1;
        await admin.from("purchase_import_events").insert({
          import_run_id: run.id,
          square_payment_id: paymentIds.length === 1 ? paymentIds[0] : null,
          square_order_id: orderId,
          event_result: "failed",
          reason: "atomic_purchase_record_failed",
          safe_detail: recordError.message,
        });
        continue;
      }

      const result = recorded?.result;
      if (result === "inserted") inserted += 1;
      else if (result === "refreshed") refreshed += 1;
      else if (result === "conflict") {
        blocked += 1;
        continue;
      } else {
        skipped += 1;
        continue;
      }

    }

    const status = failed > 0 ? (inserted + refreshed > 0 ? "partial_error" : "failed")
      : blocked > 0 ? "partial_error"
      : "succeeded";

    await finishRun({
      status,
      transactions_seen: orders.length,
      transactions_inserted: inserted,
      transactions_refreshed: refreshed,
      transactions_skipped: skipped,
      transactions_blocked: blocked,
      transactions_failed: failed,
      historical_product_lines_skipped: historicalProductLinesSkipped,
      error_summary: failed || blocked
        ? JSON.stringify({ blocked, failed })
        : null,
    });

    return json({
      status,
      import_run_id: run.id,
      transactions_seen: orders.length,
      transactions_inserted: inserted,
      transactions_refreshed: refreshed,
      transactions_skipped: skipped,
      transactions_blocked: blocked,
      transactions_failed: failed,
      historical_product_lines_skipped: historicalProductLinesSkipped,
    }, status === "failed" ? 502 : 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishRun({
      status: "failed",
      error_summary: message,
    });
    return json({
      error: "Purchase history import failed",
      import_run_id: run.id,
      detail: message,
    }, 502);
  }
});
