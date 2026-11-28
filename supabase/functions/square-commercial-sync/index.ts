import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SQUARE_BASE_URL = "https://connect.squareup.com";
const SQUARE_VERSION = "2026-09-16";

type Mapping = { product_id: string; square_item_library_token: string };
type Money = { amount?: number; currency?: string };
type LocationOverride = {
  location_id?: string;
  price_money?: Money;
  track_inventory?: boolean;
  sold_out?: boolean;
};
type CatalogObject = {
  type?: string;
  id?: string;
  is_deleted?: boolean;
  updated_at?: string;
  present_at_all_locations?: boolean;
  present_at_location_ids?: string[];
  absent_at_location_ids?: string[];
  item_data?: { variations?: CatalogObject[] };
  item_variation_data?: {
    price_money?: Money;
    track_inventory?: boolean;
    location_overrides?: LocationOverride[];
  };
};
type InventoryCount = {
  catalog_object_id?: string;
  location_id?: string;
  state?: string;
  quantity?: string;
  calculated_at?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function serviceRoleAuthorized(authHeader: string | null, apiKeyHeader: string | null) {
  const presented = new Set<string>();

  if (authHeader?.startsWith("Bearer ")) {
    presented.add(authHeader.slice(7));
  }
  if (apiKeyHeader) {
    presented.add(apiKeyHeader);
  }

  const candidates = new Set<string>();

  for (const name of [
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEY",
  ]) {
    const value = Deno.env.get(name);
    if (value) candidates.add(value);
  }

  const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeysRaw) {
    try {
      const parsed = JSON.parse(secretKeysRaw);
      const stack: unknown[] = [parsed];

      while (stack.length > 0) {
        const current = stack.pop();

        if (typeof current === "string") {
          candidates.add(current);
          continue;
        }

        if (Array.isArray(current)) {
          for (const value of current) stack.push(value);
          continue;
        }

        if (current && typeof current === "object") {
          for (const value of Object.values(current as Record<string, unknown>)) {
            stack.push(value);
          }
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

function enabledAtLocation(obj: CatalogObject, locationId: string) {
  if (obj.is_deleted) return false;
  if (obj.absent_at_location_ids?.includes(locationId)) return false;
  if (obj.present_at_all_locations === true) return true;
  if (obj.present_at_location_ids?.includes(locationId)) return true;
  return obj.present_at_all_locations !== false;
}

function locationOverride(variation: CatalogObject, locationId: string) {
  return variation.item_variation_data?.location_overrides?.find(
    (o) => o.location_id === locationId,
  );
}

function trackedAtLocation(variation: CatalogObject, locationId: string) {
  const override = locationOverride(variation, locationId);
  if (override?.track_inventory !== undefined) return override.track_inventory;
  return variation.item_variation_data?.track_inventory === true;
}

function soldOutAtLocation(variation: CatalogObject, locationId: string) {
  return locationOverride(variation, locationId)?.sold_out === true;
}

function priceAtLocation(variation: CatalogObject, locationId: string) {
  const override = locationOverride(variation, locationId);
  return override?.price_money ?? variation.item_variation_data?.price_money;
}

async function squareRequest(method: string, path: string, token: string, body?: unknown) {
  const res = await fetch(SQUARE_BASE_URL + path, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      "Square-Version": SQUARE_VERSION,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error("Square " + path + " failed (" + res.status + "): " + JSON.stringify(payload));
  }
  return payload;
}

async function squarePost(path: string, token: string, body: unknown) {
  return squareRequest("POST", path, token, body);
}

async function retrieveExactInStockCount(
  variationId: string,
  locationId: string,
  token: string,
): Promise<InventoryCount | null> {
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({ location_ids: locationId });
    if (cursor) params.set("cursor", cursor);

    const payload = await squareRequest(
      "GET",
      "/v2/inventory/" + encodeURIComponent(variationId) + "?" + params.toString(),
      token,
    );

    const counts = Array.isArray(payload?.counts) ? payload.counts as InventoryCount[] : [];
    const match = counts.find((count) =>
      count.catalog_object_id === variationId &&
      count.location_id === locationId &&
      count.state === "IN_STOCK" &&
      count.quantity !== undefined
    );

    if (match) return match;
    cursor = typeof payload?.cursor === "string" && payload.cursor ? payload.cursor : undefined;
  } while (cursor);

  return null;
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
  if (!squareToken || !squareLocationId) {
    return json({
      error: "Square production synchronization is not configured",
      code: !squareToken ? "SQUARE_PRODUCTION_ACCESS_TOKEN_MISSING" : "SQUARE_PEPPER_JUNCTION_LOCATION_ID_MISSING",
    }, 503);
  }

  const body = await req.json().catch(() => ({}));
  const requestedSourceKind = typeof body?.source_kind === "string" ? body.source_kind : "square_api";
  const sourceKind = requestedSourceKind === "square_webhook"
    ? "square_webhook"
    : requestedSourceKind === "reconciliation"
    ? "reconciliation"
    : "square_api";
  const triggerSource = sourceKind === "square_webhook"
    ? "webhook"
    : sourceKind === "reconciliation"
    ? "reconciliation"
    : "manual";

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: mappings, error: mappingsError } = await admin
    .from("square_product_mappings")
    .select("product_id, square_item_library_token");
  if (mappingsError) return json({ error: mappingsError.message }, 500);
  const rows = (mappings ?? []) as Mapping[];

  const { data: run, error: runError } = await admin
    .from("commercial_sync_runs")
    .insert({ status: "running", trigger_source: triggerSource, products_expected: rows.length })
    .select("id")
    .single();
  if (runError || !run) return json({ error: "Unable to start sync audit run" }, 500);

  try {
    const catalogPayload = await squarePost("/v2/catalog/batch-retrieve", squareToken, {
      object_ids: rows.map((r) => r.square_item_library_token),
      include_related_objects: false,
    });

    const catalogById = new Map<string, CatalogObject>();
    for (const obj of (catalogPayload.objects ?? []) as CatalogObject[]) {
      if (obj.id) catalogById.set(obj.id, obj);
    }

    const resolved: Array<{ mapping: Mapping; catalog: CatalogObject; variation: CatalogObject }> = [];
    const failures: Array<{ product_id: string; reason: string }> = [];

    for (const mapping of rows) {
      const obj = catalogById.get(mapping.square_item_library_token);
      if (!obj) {
        failures.push({ product_id: mapping.product_id, reason: "Square catalog object not returned" });
        continue;
      }

      let variation: CatalogObject | undefined;
      if (obj.type === "ITEM_VARIATION") variation = obj;
      else if (obj.type === "ITEM") {
        const variations = obj.item_data?.variations ?? [];
        if (variations.length !== 1) {
          failures.push({ product_id: mapping.product_id, reason: "Expected exactly one Square variation; found " + variations.length });
          continue;
        }
        variation = variations[0];
      } else {
        failures.push({ product_id: mapping.product_id, reason: "Unsupported Square catalog object type: " + (obj.type ?? "unknown") });
        continue;
      }

      if (!variation.id) {
        failures.push({ product_id: mapping.product_id, reason: "Square variation ID missing" });
        continue;
      }

      resolved.push({ mapping, catalog: obj, variation });
    }

    const trackedIds = resolved
      .filter((r) => trackedAtLocation(r.variation, squareLocationId))
      .map((r) => r.variation.id!);

    const inventoryPayload = trackedIds.length
      ? await squarePost("/v2/inventory/counts/batch-retrieve", squareToken, {
          catalog_object_ids: trackedIds,
          location_ids: [squareLocationId],
          states: ["IN_STOCK"],
          limit: 1000,
        })
      : { counts: [] };

    const counts = new Map<string, InventoryCount>();
    for (const count of (inventoryPayload.counts ?? []) as InventoryCount[]) {
      if (
        count.catalog_object_id &&
        count.location_id === squareLocationId &&
        count.state === "IN_STOCK" &&
        count.quantity !== undefined
      ) {
        counts.set(count.catalog_object_id, count);
      }
    }

    let updated = 0;

    for (const item of resolved) {
      const price = priceAtLocation(item.variation, squareLocationId);
      if (price?.amount === undefined || !price.currency) {
        failures.push({ product_id: item.mapping.product_id, reason: "Square fixed price missing" });
        continue;
      }

      const tracked = trackedAtLocation(item.variation, squareLocationId);
      const soldOut = soldOutAtLocation(item.variation, squareLocationId);
      let count = counts.get(item.variation.id!);
      let quantity: number | null = null;

      if (tracked && !soldOut && !count) {
        try {
          count = await retrieveExactInStockCount(
            item.variation.id!,
            squareLocationId,
            squareToken,
          ) ?? undefined;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const reason =
            "Exact Square inventory verification failed for variation " +
            item.variation.id +
            " at location " +
            squareLocationId +
            ": " +
            message;

          failures.push({ product_id: item.mapping.product_id, reason });
          await admin.from("product_commercial_state").update({
            sync_status: "stale",
            last_sync_attempt_at: new Date().toISOString(),
            last_sync_error: reason,
          }).eq("product_id", item.mapping.product_id);
          continue;
        }
      }

      if (tracked) {
        if (soldOut) {
          quantity = 0;
        } else if (count) {
          quantity = Number(count.quantity);

          if (!Number.isFinite(quantity)) {
            const reason =
              "Square inventory quantity invalid for variation " +
              item.variation.id +
              " at location " +
              squareLocationId;

            failures.push({ product_id: item.mapping.product_id, reason });
            await admin.from("product_commercial_state").update({
              sync_status: "stale",
              last_sync_attempt_at: new Date().toISOString(),
              last_sync_error: reason,
            }).eq("product_id", item.mapping.product_id);
            continue;
          }
        } else {
          const reason =
            "Square returned no IN_STOCK count for tracked variation " +
            item.variation.id +
            " at location " +
            squareLocationId +
            "; last known quantity preserved";

          failures.push({ product_id: item.mapping.product_id, reason });
          await admin.from("product_commercial_state").update({
            sync_status: "stale",
            last_sync_attempt_at: new Date().toISOString(),
            last_sync_error: reason,
          }).eq("product_id", item.mapping.product_id);
          continue;
        }
      }

      const now = new Date().toISOString();
      const enabled =
        enabledAtLocation(item.catalog, squareLocationId) &&
        enabledAtLocation(item.variation, squareLocationId);
      const archived = Boolean(item.catalog.is_deleted || item.variation.is_deleted);
      const observedAt =
        count?.calculated_at ??
        item.variation.updated_at ??
        item.catalog.updated_at ??
        null;

      const { error: updateError } = await admin
        .from("product_commercial_state")
        .upsert({
          product_id: item.mapping.product_id,
          price_amount: price.amount / 100,
          currency_code: price.currency,
          inventory_mode: tracked ? "tracked" : "unlimited",
          quantity_on_hand: tracked ? quantity : null,
          square_location_enabled: enabled,
          square_archived: archived,
          square_sold_out: soldOut,
          source_kind: sourceKind,
          source_reference: item.mapping.square_item_library_token,
          source_observed_at: observedAt,
          sync_status: "current",
          last_sync_attempt_at: now,
          last_successful_sync_at: now,
          last_sync_error: null,
        }, { onConflict: "product_id" });

      if (updateError) {
        failures.push({ product_id: item.mapping.product_id, reason: updateError.message });
        await admin.from("product_commercial_state").update({
          sync_status: "error",
          last_sync_attempt_at: now,
          last_sync_error: updateError.message,
        }).eq("product_id", item.mapping.product_id);
      } else {
        updated += 1;
      }
    }

    const status = failures.length === 0
      ? "succeeded"
      : updated > 0
      ? "partial_error"
      : "failed";

    await admin.from("commercial_sync_runs").update({
      status,
      products_updated: updated,
      products_failed: failures.length,
      completed_at: new Date().toISOString(),
      error_summary: failures.length ? JSON.stringify(failures) : null,
    }).eq("id", run.id);

    return json({
      status,
      products_expected: rows.length,
      products_updated: updated,
      products_failed: failures.length,
      failures,
    }, status === "failed" ? 502 : 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await admin.from("commercial_sync_runs").update({
      status: "failed",
      products_failed: rows.length,
      completed_at: new Date().toISOString(),
      error_summary: message,
    }).eq("id", run.id);

    return json({ error: "Commercial synchronization failed", detail: message }, 502);
  }
});