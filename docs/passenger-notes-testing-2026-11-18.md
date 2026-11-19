# Passenger Notes — controlled test evidence (2026-11-18)

**Scope:** Dev repository + isolated Supabase Testing `slubpfmpjgoupujptayy`. No Main or Production changes. No customer records inserted/modified/deleted.

## Baseline
- Product integration: `assets/js/pj-product-review.js`
- Styling: `assets/css/pj-product.css`
- Testing Edge Function: `pj-passenger-notes` v1, deployed, `verify_jwt=false`, aggregate-only read.
- Independent existing left-side Customer Line preserved.
- Five approved reviews per product threshold is **provisional**; owner has not yet settled it.

## Synthetic query fixture checks (read-only SQL CTE)
1. Five approved reviews plus one unapproved conflicting response: approved-only winner results were Rogue Wave / Stays for Coffee / Snacking / Garlic.
2. Four approved reviews: threshold false.
3. Five heat-free reviews: arrival and finish were null; food and flavor available.
4. Tied maxima: "Passengers are split" reported on appropriate fields.
5. `Snack` response presented as "Snacking", without changing stored option.
6. No persistent database fixtures or customer data mutations.

## Responsive markup/style fixture (isolated Chromium)
Viewport widths 320 / 360 / 375 / 390 / 430 / 768 px:
- All showed 4 cards in two columns without document horizontal overflow.
- Visual inspection performed at 375 px.
- Placement represented as Standard → Passenger Notes → Share This Sauce.
- These tests reproduce the current section markup/CSS; they are **not** a real deployed product-page browser test.

## Source/deployment checks
- The Testing Edge Function reports ACTIVE, version 1.
- Main still contains no Passenger Notes implementation.
- The frontend mounts section independently of the removed Passenger Reviews summary.
- When service returns unavailable/insufficient reviews, section remains hidden.
- Customer Line prefetch and dismissal functions are still initialized.
- Public endpoint selects only `q10,q11,q12,q13` from approved records, not names, original prose, private notes or ratings.

## Remaining acceptance gates
- Perform actual HTTP invocation of Testing Edge Function (including missing/invalid slug).
- Validate real local Dev page with isolated Testing and a qualifying *non-customer* fixture dataset or ephemeral test harness.
- Browser test the full actual product page on phone and desktop, including network failure and reduced-data conditions.
- Confirm minimum review threshold with owner (currently proposed 5).
- Check multiple representative product pages and heat-free products.
- Owner approval required before selective promotion; Production endpoint not deployed.

**Do not infer live endpoint/UI acceptance from the synthetic fixture results.**
