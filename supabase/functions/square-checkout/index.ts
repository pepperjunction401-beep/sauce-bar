import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { loyaltyPreviewMatches } from "../_shared/loyalty-order-evidence.ts";

const IS_TESTING_PROJECT =
  Deno.env.get("SUPABASE_URL") === "https://slubpfmpjgoupujptayy.supabase.co";
const SQUARE_BASE_URL = IS_TESTING_PROJECT
  ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
function databaseServiceKey(): string | undefined {
  if (!IS_TESTING_PROJECT) return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const direct = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_SECRET_KEY");
  if (direct) return direct;
  try {
    const parsed = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    return typeof parsed.default === "string" ? parsed.default : undefined;
  } catch { return undefined; }
}

// Loyalty Bridge price calculation is private to the existing Square checkout.
// No wallet changes, order creation, replacement payment path or reservation.
function loyaltyOrderPricing(paidLines: any[], reward: any, variation: string | null) {
  if (!Array.isArray(paidLines) || paidLines.length === 0) throw new Error("Paid merchandise required");
  const product = reward.reward_kind === "product";
  if (product ? !variation : ![10,15,20].includes(reward.discount_percent)) {
    throw new Error("Invalid canonical Loyalty reward");
  }
  const uid = product ? "PJ_LOYALTY_FREE" : "PJ_LOYALTY_PERCENT";
  const lines = product
    ? [...paidLines, {quantity:"1", catalog_object_id:variation, applied_discounts:[{discount_uid:uid}]}]
    : paidLines.map(line => ({...line, applied_discounts:[{discount_uid:uid}]}));
  return {
    line_items: lines,
    discounts: [{uid, name:product ? "Loyalty Bridge Complimentary" : "Loyalty Bridge Discount",
      type:"FIXED_PERCENTAGE", percentage:product ? "100" : String(reward.discount_percent),
      scope:"LINE_ITEM"}],
  };
}

const SQUARE_VERSION = "2026-09-16";
const MAX_DISTINCT_ITEMS = 50;
const MAX_QTY_PER_ITEM = 99;

const ALLOWED_ORIGINS = new Set([
  "https://pepperjunction401-beep.github.io",
  "https://pepperjunction401.com",
  "https://www.pepperjunction401.com",
]);
function permittedOrigin(origin: string | null): boolean {
  return !!origin && (ALLOWED_ORIGINS.has(origin) ||
    (IS_TESTING_PROJECT &&
      /^http:\/\/(?:localhost|127\.0\.0\.1):(?:8000|8080)$/.test(origin)));
}

type CartItem = { product_id?: unknown; quantity?: unknown; kind?: unknown; reward_row_number?: unknown; reward_product_slug?: unknown; price?: unknown };
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
  const allowed = permittedOrigin(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "content-type, authorization",
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
    if (!permittedOrigin(origin)) {
      return new Response(null, { status: 403 });
    }
    return new Response(null, {
      status: 204,
      headers: corsHeaders(origin),
    });
  }

  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  if (!permittedOrigin(origin)) {
    return json(req, { error: "Origin not allowed" }, 403);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = databaseServiceKey();
  const squareToken = Deno.env.get(IS_TESTING_PROJECT
    ? "SQUARE_SANDBOX_ACCESS_TOKEN" : "SQUARE_PRODUCTION_ACCESS_TOKEN");
  const squareLocationId = Deno.env.get(IS_TESTING_PROJECT
    ? "SQUARE_SANDBOX_LOCATION_ID" : "SQUARE_PEPPER_JUNCTION_LOCATION_ID");

  if (!supabaseUrl || !serviceRoleKey) {
    return json(req, { error: "Checkout service is not configured" }, 503);
  }
  if (!squareToken || !squareLocationId) {
    return json(req, { error: "Square checkout is not configured" }, 503);
  }

  const body = await req.json().catch(() => ({}));
  // Reward redemption belongs to the existing verified-purchase importer,
  // never to the checkout API or a browser-triggered payment verifier.
  if (body?.action) return json(req, { error: "Unsupported checkout action" }, 400);
  const celestialTimezone = typeof body?.checkout_timezone === "string" ? body.checkout_timezone.trim() : "";
  const sessionKey = typeof body?.shopping_session_id === "string" ? body.shopping_session_id : "";
  if (sessionKey && !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(sessionKey)) {
    return json(req, { error: "Shopping session identity is required" }, 400);
  }
  const rawItems = Array.isArray(body?.items) ? body.items as CartItem[] : [];
  const loyaltyClaim = body?.loyalty_reward;
  if (loyaltyClaim !== undefined && (!loyaltyClaim ||
      !Number.isInteger(loyaltyClaim.token_number) || loyaltyClaim.token_number < 1 ||
      loyaltyClaim.token_number > 15 || Object.keys(loyaltyClaim).length !== 1 ||
      body?.review_reward || rawItems.some(item => item?.kind))) {
    return json(req, { error: "Loyalty Bridge checkout is unavailable or invalid" }, 409);
  }
  // Reward is transmitted as a distinct $0 line from PJCart, never as a
  // client-supplied discount on paid merchandise.
  const freeLines = rawItems.filter(item => item?.kind === "pj_review_reward");
  if (freeLines.length > 1 || rawItems.some(item => item?.kind && item.kind !== "pj_review_reward")) {
    return json(req, { error: "Invalid cart line classification" }, 400);
  }
  const rewardLine = freeLines[0] ?? null;
  const paidCartItems = rawItems.filter(item => item?.kind !== "pj_review_reward");
  if (body?.review_reward && !rewardLine || rewardLine && !body?.review_reward) {
    return json(req, { error: "Review reward cart mismatch" }, 400);
  }
  const checkoutRequestId =
    typeof body?.checkout_request_id === "string" ? body.checkout_request_id : "";

  if (!/^[A-Za-z0-9-]{8,80}$/.test(checkoutRequestId)) {
    return json(req, { error: "Invalid checkout request" }, 400);
  }
  if (rawItems.length < 1 || rawItems.length > MAX_DISTINCT_ITEMS) {
    return json(req, { error: "Cart is empty or too large" }, 400);
  }

  if (paidCartItems.length < 1) {
    return json(req, { error: "Paid merchandise required with reward" }, 400);
  }
  const normalized = new Map<string, number>();
  for (const item of paidCartItems) {
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
  // Re-quote through the customer's JWT. Browser-supplied costs, discounts,
  // customer IDs, product slugs and availability are never authoritative.
  let verifiedLoyalty: any = null;
  if (loyaltyClaim !== undefined) {
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer /i, "").trim();
    if (!bearer) return json(req, {error:"Loyalty Bridge sign-in required"},401);
    const {data:identity,error:userError} = await admin.auth.getUser(bearer);
    if (userError || !identity?.user?.id || !identity.user.email_confirmed_at)
      return json(req, {error:"Loyalty Bridge sign-in required"},401);
    const customerClient = createClient(supabaseUrl,serviceRoleKey,{
      auth:{persistSession:false,autoRefreshToken:false},
      global:{headers:{Authorization:"Bearer "+bearer}},
    });
    const {data:q,error:quoteError} = await customerClient.rpc("pj_loyalty_my_exchange_quote",{
      p_token_number:loyaltyClaim.token_number
    });
    if (quoteError || q?.status !== "qualifies" || q.token_number !== loyaltyClaim.token_number ||
        !Number.isInteger(q.tier_cost) || q.tier_cost < 50 || q.tier_cost > 225 ||
        !Number.isInteger(q.current_credits) || q.current_credits < q.tier_cost || q.current_credits > 275)
      return json(req,{error:"Loyalty Bridge reward unavailable"},409);
    const product = q.reward_kind === "product" && typeof q.reward_product_slug === "string" &&
      /^[a-z0-9][a-z0-9-]*$/.test(q.reward_product_slug) && q.discount_percent == null;
    const discount = q.reward_kind === "discount" && q.reward_product_slug == null &&
      [10,15,20].includes(q.discount_percent);
    if (!product && !discount) return json(req,{error:"Invalid Loyalty reward definition"},409);
    // The existing verified identity bridge supplies the Square customer.
    const {data:link,error:linkError} = await admin.from("square_customer_links")
      .select("square_customer_id").eq("customer_id",identity.user.id)
      .eq("is_active",true).maybeSingle();
    if (linkError || typeof link?.square_customer_id !== "string" || !link.square_customer_id)
      return json(req,{error:"Verified Square customer identity unavailable"},409);
    verifiedLoyalty = {...q, customerId:identity.user.id, squareCustomerId:link.square_customer_id};
    if (product && !slugs.includes(q.reward_product_slug)) slugs.push(q.reward_product_slug);
  }
  // Existing paid-only checkout requires no account or behavior changes.
  let verifiedReward: {customerId: string; row: number; productId: string; slug: string} | null = null;
  if (rewardLine) {
    const row = Number(rewardLine.reward_row_number);
    const claim = body.review_reward;
    if (!Number.isInteger(row) || row < 1 ||
        rewardLine.product_id !== "pj-review-reward-row-" + row ||
        rewardLine.quantity !== 1 || rewardLine.price !== 0 ||
        !claim || claim.row_number !== row ||
        typeof rewardLine.reward_product_slug !== "string" ||
        claim.selected_product_slug !== rewardLine.reward_product_slug) {
      return json(req, { error: "Invalid Review Board reward line" }, 409);
    }
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer /i, "").trim();
    if (!bearer) return json(req, { error: "Review Board sign-in required" }, 401);
    const { data: identity, error: userError } = await admin.auth.getUser(bearer);
    if (userError || !identity?.user?.id || !identity.user.email_confirmed_at) {
      return json(req, { error: "Review Board sign-in required" }, 401);
    }
    const [{ data: entitlement, error: entitlementError }, { data: selectedProduct, error: selectedError }] =
      await Promise.all([
        admin.from("pj_review_reward_entitlements").select("status,selected_product_id")
          .eq("customer_id", identity.user.id).eq("row_number", row).maybeSingle(),
        admin.from("pj_products").select("id,cns_slug,is_active")
          .eq("cns_slug", rewardLine.reward_product_slug).maybeSingle(),
      ]);
    if (entitlementError || selectedError || !entitlement ||
        entitlement.status !== "selected" || !selectedProduct ||
        selectedProduct.is_active !== true ||
        entitlement.selected_product_id !== selectedProduct.id) {
      return json(req, { error: "Review Board reward not available" }, 409);
    }
    const { data: allowedSlot, error: slotError } = await admin.from("pj_review_board_slots")
      .select("slot_number").eq("row_number", row)
      .eq("product_id", selectedProduct.id).maybeSingle();
    if (slotError || !allowedSlot) {
      return json(req, { error: "Reward is not eligible for this row" }, 409);
    }
    verifiedReward = {
      customerId: identity.user.id, row,
      productId: selectedProduct.id, slug: selectedProduct.cns_slug,
    };
    if (!slugs.includes(selectedProduct.cns_slug)) slugs.push(selectedProduct.cns_slug);
  }

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
  // Isolated Testing uses its two verified Square Sandbox fixtures. The
  // Production mapping table and checkout architecture stay unchanged.
  if (IS_TESTING_PROJECT) {
    const {data: fixtures, error: fixtureError} = await admin
      .from("pj_review_sandbox_catalog")
      .select("product_id,square_sandbox_item_id,sandbox_verified_at")
      .in("product_id", productIds);
    if (fixtureError || !fixtures || fixtures.some((f: any) =>
        !f.sandbox_verified_at || !f.square_sandbox_item_id)) {
      return json(req, {error:"Testing Sandbox product mapping is unavailable"}, 503);
    }
    const fixtureMap = new Map(fixtures.map((f: any) =>
      [f.product_id, f.square_sandbox_item_id]));
    for (const mapping of mappingRows) {
      const sandboxId = fixtureMap.get(mapping.product_id);
      if (typeof sandboxId === "string") mapping.square_item_library_token = sandboxId;
    }
    // The two Sandbox catalog fixtures do not have Production commercial-state
    // rows. Use their Sandbox catalog verification ONLY in isolated Testing.
    // Live stock, location availability, and price are still checked by Square.
    for (const fixture of fixtures) {
      if (!commercialRows.some(row => row.product_id === fixture.product_id)) {
        commercialRows.push({
          product_id: fixture.product_id, sync_status:"sandbox-fixture",
          square_location_enabled:true, square_archived:false,
          square_sold_out:false, availability_status:"available",
        });
      }
    }
  }

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

        // Paid quantity plus the one physical complimentary bottle must fit stock.
        const needed = (normalized.get(item.slug) ?? 0) +
          (verifiedReward && item.slug === verifiedReward.slug ? 1 : 0) +
          (verifiedLoyalty?.reward_kind === "product" &&
            item.slug === verifiedLoyalty.reward_product_slug ? 1 : 0);
        if (onHand < needed) {
          return json(req, {
            error: "Not enough inventory is available for a cart item",
            product_id: item.slug,
            available_quantity: Math.max(0, onHand),
          }, 409);
        }
      }
    }

    const paidLines = resolved.filter(item => normalized.has(item.slug)).map(item => ({
      quantity: String(normalized.get(item.slug)),
      catalog_object_id: item.variation.id,
    }));
    const rewardVariation = verifiedReward
      ? resolved.find(item => item.slug === verifiedReward!.slug)?.variation.id
      : null;
    if (verifiedReward && !rewardVariation) {
      return json(req, { error: "Reward inventory mapping unavailable" }, 409);
    }
    const order: any = {
      location_id: squareLocationId,
      line_items: [...paidLines, ...(rewardVariation ? [{
        quantity: "1",
        catalog_object_id: rewardVariation,
        applied_discounts: [{ discount_uid: "PJ_REVIEW_FREE" }],
      }] : [])],
      pricing_options: {
        auto_apply_taxes: true,
        auto_apply_discounts: true,
      },
    };
    if (verifiedReward) {
      order.discounts = [{
        uid: "PJ_REVIEW_FREE",
        name: "Review Board Complimentary",
        type: "FIXED_PERCENTAGE",
        percentage: "100",
        scope: "LINE_ITEM",
      }];
      // Square's authoritative pricing must confirm only the reward received
      // the review discount, with one fully-free line and paid items intact.
      const preview = await squarePost("/v2/orders/calculate", squareToken, { order });
      const lines = preview?.order?.line_items ?? [];
      const free = lines.filter((line: any) =>
        line.total_money?.amount === 0 &&
        line.applied_discounts?.some((d: any) => d.discount_uid === "PJ_REVIEW_FREE"));
      const leaked = lines.some((line: any) =>
        line.total_money?.amount > 0 &&
        line.applied_discounts?.some((d: any) => d.discount_uid === "PJ_REVIEW_FREE"));
      if (free.length !== 1 || free[0].quantity !== "1" ||
          free[0].catalog_object_id !== rewardVariation || leaked ||
          lines.length !== paidLines.length + 1) {
        return json(req, { error: "Square reward discount validation failed" }, 409);
      }
    }

    if (verifiedLoyalty) {
      const variation = verifiedLoyalty.reward_kind === "product"
        ? resolved.find(item => item.slug === verifiedLoyalty.reward_product_slug)?.variation.id ?? null
        : null;
      const pricing = loyaltyOrderPricing(paidLines, verifiedLoyalty, variation);
      const preview = await squarePost("/v2/orders/calculate", squareToken, {
        order:{...order,...pricing},
      });
      if (!loyaltyPreviewMatches(preview,pricing,verifiedLoyalty,variation))
        return json(req,{error:"Square Loyalty reward price validation failed"},409);
      const {data:binding,error:bindingError} = await admin.rpc("pj_loyalty_begin_order_binding",{
        p_customer_id:verifiedLoyalty.customerId,p_token_number:verifiedLoyalty.token_number,
        p_request_id:checkoutRequestId,p_expected_pricing:pricing,p_reward_variation_id:variation,
      });
      if (bindingError || binding?.accepted !== true)
        return json(req,{error:"Loyalty reward checkout already pending or unavailable"},409);
      Object.assign(order,pricing,{customer_id:verifiedLoyalty.squareCustomerId,reference_id:"PJ_LOYALTY"});
    }
    // The existing checkout owns the Square order, checkout link and redirect.
    // Reserve the selected reward before opening the same standard payment link.
    if (verifiedReward) {
      const { error: reserveError, data: reservation } = await admin.rpc(
        "pj_review_reward_reserve_checkout", {
          p_customer_id: verifiedReward.customerId,
          p_row_number: verifiedReward.row,
          p_expected_product_id: verifiedReward.productId,
          p_request_id: checkoutRequestId,
        });
      if (reserveError || !reservation) {
        return json(req, { error: "Review reward already reserved or unavailable" }, 409);
      }
    }
    let squarePayload: any;
    try {
      squarePayload = await squarePost(
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
    } catch (checkoutError) {
      if (verifiedReward) {
        await admin.from("pj_review_reward_checkout_attempts")
          .update({state:"cancelled"})
          .eq("checkout_request_id", checkoutRequestId).eq("state", "creating");
      }
      throw checkoutError;
    }

    const checkoutUrl = squarePayload?.payment_link?.url;
    const orderId = squarePayload?.payment_link?.order_id;

    if (typeof checkoutUrl !== "string" || !checkoutUrl) {
      return json(req, { error: "Square did not return a checkout URL" }, 502);
    }

    if (typeof orderId !== "string" || !orderId) {
      return json(req, { error: "Square order identity missing" }, 502);
    }
    if (verifiedReward) {
      const paymentLinkId = squarePayload?.payment_link?.id;
      if (typeof paymentLinkId !== "string" || !paymentLinkId) {
        return json(req, { error: "Reward checkout link identity missing" }, 503);
      }
      const {data: savedAttempt, error: attemptError} = await admin.from("pj_review_reward_checkout_attempts")
        .update({
          state: "opened", square_order_id: orderId,
          square_payment_link_id: paymentLinkId, opened_at: new Date().toISOString(),
        }).eq("checkout_request_id", checkoutRequestId).eq("state", "creating")
        .select("id").maybeSingle();
      if (attemptError || !savedAttempt) {
        console.error("Review Board reward attempt registration failed", orderId);
        return json(req, { error: "Could not register reward checkout" }, 503);
      }
    }
    if (verifiedLoyalty) {
      const paymentLinkId = squarePayload?.payment_link?.id;
      if (typeof paymentLinkId !== "string" || !paymentLinkId)
        return json(req,{error:"Loyalty checkout link identity missing"},503);
      const {data:bound,error:bindError} = await admin.rpc("pj_loyalty_bind_square_order",{
        p_request_id:checkoutRequestId,p_customer_id:verifiedLoyalty.customerId,
        p_square_order_id:orderId,p_square_payment_link_id:paymentLinkId,
      });
      if (bindError || bound !== true) {
        // Do not release an unbound discounted payment link. Keep the binding
        // pending for server-side reconciliation, even after an ambiguous error.
        console.error("Loyalty order binding failed",orderId);
        return json(req,{error:"Could not verify Loyalty checkout identity"},503);
      }
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
