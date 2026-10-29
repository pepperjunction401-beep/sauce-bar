import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SQUARE_BASE_URL = "https://connect.squareup.com";
const SQUARE_VERSION = "2026-09-16";
const MAX_DISTINCT_ITEMS = 50;
const MAX_QTY_PER_ITEM = 99;

const ALLOWED_ORIGINS = new Set([
  "https://pepperjunction401-beep.github.io",
  "https://pepperjunction401.com",
  "https://www.pepperjunction401.com",
]);

type CartItem = { product_id?: unknown; quantity?: unknown };
type ProductRow = { id: string; cns_slug: string; is_active: boolean };
type MappingRow = { product_id: string; square_item_library_token: string };
type CommercialRow = {
  product_id: string;
  sync_status: string;
  square_location_enabled: boolean;
  square_archived: boolean;
  square_sold_out: boolean;
  availability_status: string | null;
};
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

function locationOverride(variation: CatalogObject, locationId: string) {
  return variation.item_variation_data?.location_overrides?.find(
    (o) => o.location_id === locationId,
  );
}

function enabledAtLocation(obj: CatalogObject, locationId: string) {
  if (obj.is_deleted) return false;
  if (obj.absent_at_location_ids?.includes(locationId)) return false;
  if (obj.present_at_all_locations === true) return true;
  if (obj.present_at_location_ids?.includes(locationId)) return true;
  return obj.present_at_all_locations !== false;
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
  return locationOverride(variation, locationId)?.price_money ??
    variation.item_variation_data?.price_money;
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
    const error = new Error("Square request failed");
    (error as any).status = res.status;
    (error as any).payload = payload;
    throw error;
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

function returnUrlForOrigin(origin: string) {
  if (origin === "https://pepperjunction401-beep.github.io") {
    return origin + "/sauce-bar/post-payment-badges.html";
  }
  return origin + "/post-payment-badges.html";
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");

  if (req.method === "OPTIONS") {
    if (!origin || !ALLOWED_ORIGINS.has(origin)) {
      return new Response(null, { status: 403 });
    }
    return new Response(null, {
      status: 204,
      headers: corsHeaders(origin),
    });
  }

  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return json(req, { error: "Origin not allowed" }, 403);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const squareToken = Deno.env.get("SQUARE_PRODUCTION_ACCESS_TOKEN");
  const squareLocationId = Deno.env.get("SQUARE_PEPPER_JUNCTION_LOCATION_ID");

  if (!supabaseUrl || !serviceRoleKey) {
    return json(req, { error: "Checkout service is not configured" }, 503);
  }
  if (!squareToken || !squareLocationId) {
    return json(req, { error: "Square checkout is not configured" }, 503);
  }

  const body = await req.json().catch(() => ({}));
  const celestialTimezone = typeof body?.checkout_timezone === "string" ? body.checkout_timezone.trim() : "";
  const sessionKey = typeof body?.shopping_session_id === "string" ? body.shopping_session_id : "";
  if (sessionKey && !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(sessionKey)) {
    return json(req, { error: "Shopping session identity is required" }, 400);
  }
  const rawItems = Array.isArray(body?.items) ? body.items as CartItem[] : [];
  const checkoutRequestId =
    typeof body?.checkout_request_id === "string" ? body.checkout_request_id : "";

  if (!/^[A-Za-z0-9-]{8,80}$/.test(checkoutRequestId)) {
    return json(req, { error: "Invalid checkout request" }, 400);
  }
  if (rawItems.length < 1 || rawItems.length > MAX_DISTINCT_ITEMS) {
    return json(req, { error: "Cart is empty or too large" }, 400);
  }

  const normalized = new Map<string, number>();
  for (const item of rawItems) {
    const productId = typeof item?.product_id === "string" ? item.product_id.trim() : "";
    const quantity = Number(item?.quantity);

    if (!productId || productId.length > 200 || !Number.isInteger(quantity) ||
        quantity < 1 || quantity > MAX_QTY_PER_ITEM) {
      return json(req, { error: "Cart contains an invalid item" }, 400);
    }

    const nextQty = (normalized.get(productId) ?? 0) + quantity;
    if (nextQty > MAX_QTY_PER_ITEM) {
      return json(req, { error: "Cart quantity is too large" }, 400);
    }
    normalized.set(productId, nextQty);
  }

  const slugs = Array.from(normalized.keys());
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: products, error: productError } = await admin
    .from("pj_products")
    .select("id,cns_slug,is_active")
    .in("cns_slug", slugs);

  if (productError) return json(req, { error: "Unable to validate cart" }, 500);

  const productRows = (products ?? []) as ProductRow[];
  if (productRows.length !== slugs.length ||
      productRows.some((p) => p.is_active !== true)) {
    return json(req, { error: "One or more cart items are unavailable" }, 409);
  }

  const productIds = productRows.map((p) => p.id);

  const [{ data: mappings, error: mappingError }, { data: commercial, error: commercialError }] =
    await Promise.all([
      admin
        .from("square_product_mappings")
        .select("product_id,square_item_library_token")
        .in("product_id", productIds),
      admin
        .from("product_commercial_state")
        .select("product_id,sync_status,square_location_enabled,square_archived,square_sold_out,availability_status")
        .in("product_id", productIds),
    ]);

  if (mappingError || commercialError) {
    return json(req, { error: "Unable to validate Square product state" }, 500);
  }

  const mappingRows = (mappings ?? []) as MappingRow[];
  const commercialRows = (commercial ?? []) as CommercialRow[];

  if (mappingRows.length !== productIds.length || commercialRows.length !== productIds.length) {
    return json(req, { error: "One or more cart items are not checkout-ready" }, 409);
  }

  const mappingByProduct = new Map(mappingRows.map((m) => [m.product_id, m]));
  const stateByProduct = new Map(commercialRows.map((s) => [s.product_id, s]));
  const productBySlug = new Map(productRows.map((p) => [p.cns_slug, p]));

  for (const slug of slugs) {
    const product = productBySlug.get(slug)!;
    const state = stateByProduct.get(product.id);

    if (!mappingByProduct.get(product.id) || !state) {
      return json(req, {
        error: "One or more cart items are not checkout-ready",
        product_id: slug,
      }, 409);
    }

    if (
      state.sync_status === "current" &&
      (
        state.square_location_enabled !== true ||
        state.square_archived === true ||
        state.square_sold_out === true ||
        (state.availability_status && state.availability_status !== "available")
      )
    ) {
      return json(req, {
        error: "One or more cart items are currently unavailable",
        product_id: slug,
      }, 409);
    }
  }

  try {
    const catalogPayload = await squarePost(
      "/v2/catalog/batch-retrieve",
      squareToken,
      {
        object_ids: mappingRows.map((m) => m.square_item_library_token),
        include_related_objects: false,
      },
    );

    const catalogById = new Map<string, CatalogObject>();
    for (const obj of (catalogPayload.objects ?? []) as CatalogObject[]) {
      if (obj.id) catalogById.set(obj.id, obj);
    }

    const resolved: Array<{
      slug: string;
      quantity: number;
      catalog: CatalogObject;
      variation: CatalogObject;
    }> = [];

    for (const slug of slugs) {
      const product = productBySlug.get(slug)!;
      const mapping = mappingByProduct.get(product.id)!;
      const catalog = catalogById.get(mapping.square_item_library_token);

      if (!catalog) {
        return json(req, { error: "Square could not validate a cart item", product_id: slug }, 409);
      }

      let variation: CatalogObject | undefined;
      if (catalog.type === "ITEM_VARIATION") {
        variation = catalog;
      } else if (catalog.type === "ITEM") {
        const variations = catalog.item_data?.variations ?? [];
        if (variations.length !== 1) {
          return json(req, { error: "Square product variation is ambiguous", product_id: slug }, 409);
        }
        variation = variations[0];
      }

      if (!variation?.id ||
          !enabledAtLocation(catalog, squareLocationId) ||
          !enabledAtLocation(variation, squareLocationId) ||
          soldOutAtLocation(variation, squareLocationId)) {
        return json(req, { error: "A cart item is not available at Pepper Junction", product_id: slug }, 409);
      }

      const price = priceAtLocation(variation, squareLocationId);
      if (typeof price?.amount !== "number" || price.amount < 0 || price.currency !== "USD") {
        return json(req, { error: "Square price is unavailable for a cart item", product_id: slug }, 409);
      }

      resolved.push({
        slug,
        quantity: normalized.get(slug)!,
        catalog,
        variation,
      });
    }

    const trackedVariationIds = resolved
      .filter((r) => trackedAtLocation(r.variation, squareLocationId))
      .map((r) => r.variation.id!);

    if (trackedVariationIds.length) {
      const inventoryPayload = await squarePost(
        "/v2/inventory/counts/batch-retrieve",
        squareToken,
        {
          catalog_object_ids: trackedVariationIds,
          location_ids: [squareLocationId],
          states: ["IN_STOCK"],
          limit: 1000,
        },
      );

      const countByVariation = new Map<string, InventoryCount>();
      for (const count of (inventoryPayload.counts ?? []) as InventoryCount[]) {
        if (
          !count.catalog_object_id ||
          count.location_id !== squareLocationId ||
          count.state !== "IN_STOCK" ||
          count.quantity === undefined
        ) continue;

        countByVariation.set(count.catalog_object_id, count);
      }

      for (const item of resolved) {
        if (!trackedAtLocation(item.variation, squareLocationId)) continue;

        let count = countByVariation.get(item.variation.id!);

        if (!count) {
          count = await retrieveExactInStockCount(
            item.variation.id!,
            squareLocationId,
            squareToken,
          ) ?? undefined;
        }

        if (!count) {
          return json(req, {
            error: "Square could not verify inventory for a cart item",
            product_id: item.slug,
          }, 503);
        }

        const onHand = Number(count.quantity);
        if (!Number.isFinite(onHand)) {
          return json(req, {
            error: "Square returned an invalid inventory quantity for a cart item",
            product_id: item.slug,
          }, 503);
        }

        if (onHand < item.quantity) {
          return json(req, {
            error: "Not enough inventory is available for a cart item",
            product_id: item.slug,
            available_quantity: Math.max(0, onHand),
          }, 409);
        }
      }
    }

    const order = {
      location_id: squareLocationId,
      line_items: resolved.map((item) => ({
        quantity: String(item.quantity),
        catalog_object_id: item.variation.id,
      })),
      pricing_options: {
        auto_apply_taxes: true,
        auto_apply_discounts: true,
      },
    };

    const squarePayload = await squarePost(
      "/v2/online-checkout/payment-links",
      squareToken,
      {
        idempotency_key: "pj-web-" + checkoutRequestId,
        description: "Pepper Junction website checkout",
        order,
        checkout_options: {
          ask_for_shipping_address: true,
          allow_tipping: false,
          redirect_url: returnUrlForOrigin(origin),
        },
        payment_note: "Pepper Junction website checkout",
      },
    );

    const checkoutUrl = squarePayload?.payment_link?.url;
    const orderId = squarePayload?.payment_link?.order_id;

    if (typeof checkoutUrl !== "string" || !checkoutUrl) {
      return json(req, { error: "Square did not return a checkout URL" }, 502);
    }

    if (typeof orderId !== "string" || !orderId) {
      return json(req, { error: "Square order identity missing" }, 502);
    }
    if (celestialTimezone) {
      // A badge evidence failure must not strand a valid Square checkout.
      // Log the Square order for controlled follow-up; never manufacture badge evidence.
      try {
        const { error: celestialBindError } = await admin.rpc("pj_celestial_register_checkout_timezone", {
          p_order: orderId,
          p_request: checkoutRequestId,
          p_timezone: celestialTimezone,
        });
        if (celestialBindError) {
          console.error("Checkout timezone evidence failed for Square order", orderId, celestialBindError.message);
        }
      } catch (celestialBindException) {
        console.error("Checkout timezone evidence exception for Square order", orderId, celestialBindException);
      }
    }
    if (sessionKey) {
    const { error: sessionBindError } = await admin.rpc("pj_bottle_coin_register_checkout", {
      p_order: orderId,
      p_request: checkoutRequestId,
      p_session: sessionKey,
    });
    if (sessionBindError) {
      console.error("Bottle Coin checkout binding failed:", sessionBindError.message);
      return json(req, { error: "Could not establish checkout session" }, 503);
    }
    }

    return json(req, {
      checkout_url: checkoutUrl,
      square_order_id: typeof orderId === "string" ? orderId : null,
      shipping_amount: null,
      currency_code: "USD",
    });
  } catch (error) {
    const status = Number((error as any)?.status || 0);
    const detail = (error as any)?.payload;
    console.error("square-checkout bridge failed", status, detail ?? error);

    return json(req, {
      error: "Unable to open Square checkout right now",
    }, 502);
  }
});
