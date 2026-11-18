# Pepper Junction — Review Board → Cart integration (Dev only)
**Date:** November 17, 2026
**Scope:** Sauce-Bar-Dev browser/UX integration, isolated Supabase Testing and Square Sandbox. No changes to main or Production. The frozen Loyalty Bridge/PJ Credits and standard Square checkout implementation are not modified outside the explicit localhost-only guard.

## Flow
1. Server-authoritative completed row and reward selection are displayed by `assets/js/pj-review-board-live.js`.
2. On localhost only, **Review Reward in Cart (Sandbox)** opens `cart-page.html?reviewRewardRow=N`, saving only the intended row number in tab-session storage. The server remains authoritative.
3. `cart-page.html` loads the Supabase Testing auth and Review Board adapter only if it is running on localhost/127.0.0.1 **and** a reward row or pending payment is present. The normal checkout is hidden before asynchronous scripts load.
4. `assets/js/pj-review-cart-dev.js` reads the actual authenticated Board API and governed CNS display name. The free item is represented in its own selection panel; it is NEVER inserted into `PJCart.items`, paid subtotal, or badge previews.
5. With at least one paid item, the customer can start the existing `PJCart.startReviewRewardCheckout` function. The isolated backend validates the saved entitlement and creates the $0 reward line through Square Sandbox.
6. Pending Square Sandbox orders persist per tab for verification. A confirmed payment redeems the row once and clears the paid cart **only if its content still matches the checkout snapshot**, avoiding loss of new items.
7. An explicit **Save Reward for Later** control removes the local reward checkout intent but does NOT consume the server entitlement or paid cart. **Local Dev never opens live checkout**, even after deferral.
8. On localhost, `PJCart.startCheckout` rejects **all** ordinary Production Square checkout attempts, including with no reward selected. Local Sandbox checkout remains separately available. Live domains are untouched.

## Simulated browser/code regression findings
- 8 UI simulations passed: live-domain no-op; empty paid cart disabled; valid paid cart enabled; pending confirmation; user defers; already redeemed; other row pending; Board API failure fails closed.
- 5 earlier checkout guard simulations passed for selected, pending and query-parameter rewards. An additional safety revision now blocks **all local ordinary checkout**, including plain carts; the live-domain checkout path is unchanged. That revision must be separately verified.
- 4 checkout finalization simulations passed: unchanged paid cart clears on verified payment; modified paid cart remains; declined/unconfirmed payment preserves pending/order; idempotent replay accepted.
- All 3 edited JS scripts and cart-page inline JS passed JavaScript syntax evaluation.
- Confirmed current Dev cart-page and cart-engine blobs differ from main: no main promotion or Production modification.
- Testing checkout Edge Function remains ACTIVE v22, with temporary E2E test endpoints absent.

**Important limits:** The UI scenarios above are mocked browser-DOM tests, not an interactive browser session. The earlier actual Square Sandbox API payment tests and authenticated backend end-to-end test passed independently. The Square-hosted customer checkout return/redirect and post-payment purchase importer across every badge and PJ Credits family still require final browser/ingestion validation. Do not promote before those checks and explicit owner approval.

## Changes / recovery
Development commits:
- `f3a9e905` Dev reward cart bridge.
- `66ead662` Board-to-Cart button.
- `824bbf63`, `54f2af4e`, `5f5b118d`, `1cccf841` local-only cart page loading/guard.
- `3a58a6a6`, `adb10d55`, `62bf3598` cart snapshot and absolute localhost Production-checkout safety guard.
- `5d7ee088` Board navigation intent.
- `d20bcbfe`, `4d7f16a8`, `a2122c63`, `bfe64ed1` earned reward state, safe defer-for-later choice, and CNS name.

Prework Dev source blobs for selective recovery:
- `cart-page.html`: `7e2b93c0e8ab4546d3635d93c1615fee58e89737`
- `assets/js/cart-engine.js`: `56181e952de361aedb109a25dbf858a236a039c3`
- `assets/js/pj-review-board-live.js`: `3c2674d3636db312f903110d48327d157e062818`
- `assets/js/pj-review-cart-dev.js` did not exist before this change.
