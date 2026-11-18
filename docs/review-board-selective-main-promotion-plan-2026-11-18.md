# Pepper Junction Review Board — selective promotion preparation (read-only Production audit)
Date: 2026-11-18
Status: **PREPARED — NOT DEPLOYED**. Explicit owner authorization still required before any Production SQL, Edge Function deployment or Main update.

## Immutable source/recovery points
- Sauce-Bar-Dev at preparation: `469cd0b31f28ea31e1d9ce6f62455fcdf7f45459`.
- Main at preparation: `603794781483dc4ad7adc20bf976df3031b26e13`.
- Three owner-approved Square Sandbox acceptance checks have passed; evidence: `docs/review-board-three-check-acceptance-2026-11-18.md`.
- **No direct Dev-to-Main merge**. Use a reviewed, exact selective file/patch list with compare-and-swap branch head at execution. Re-read Main and Dev heads before any promotion: other workers may change either.

## Production database findings (read-only)
- Already exists: `pj_review_submissions`, `pj_review_private_notes`, `pj_review_personal_ratings`, `pj_review_approval_events`, original Review Service / questionnaire RPCs; **do not rerun initial questionnaire foundation migrations**.
- Missing: `pj_review_board_slots`, `pj_review_row_slot_credits`, `pj_review_row_achievements`, `pj_review_reward_entitlements`, `pj_review_reward_checkout_attempts`, `pj_review_reward_excluded_lines`, and reserve/finalize reward RPCs.
- Production has 68 registered Review Board product slugs, all exactly matching the approved 68-slot roster. Two slugs lack existing Square mappings/commercial-state records: `stanky-honey-mango-habanero`, `sweet-gs-smoked-cheddar-pretzels-spicy`. Keep both in their approved Board roster positions; the existing Production reward selector will **not offer them** until they become genuinely commercially available. Do not manufacture inventory.
- Production original review submissions = 0; review approval events = 0. Existing review triggers must be preserved.
- Existing purchase_line_items and passenger merchandise evidence tables are present. The zero-dollar exclusion trigger must be deployed **before** any reward-bearing purchase can be ingested.
- Existing Production functions include `square-checkout` v9, `square-current-transaction-ingest` v19, `checkout-order-confirmed` v3, and `pj-review-service` v2. The updated Review Board versions are installed **only in isolated Testing**, not Production.

## Proposed Production database installation order (requires owner's explicit Go Ahead)
1. `supabase/sql/pj_review_board_award_foundation.sql`: approved 68 roster + achievement/entitlement tables + review trigger. Verify expected roster size before continuing.
2. `supabase/sql/pj_review_reward_checkout_attempt_foundation.sql`: reserved checkout state.
3. `supabase/sql/pj_review_reward_atomic_selection_reservation.sql`: atomic selection/reservation.
4. `supabase/sql/pj_review_reward_selection_grant.sql`: permission for server selection RPC.
5. `supabase/sql/pj_review_reward_atomic_verified_redemption.sql`: purchase-verified redemption and permissions.
6. `supabase/sql/pj_review_reward_exclude_free_intake_lines.sql`: matched zero-dollar purchase and passenger evidence exclusion.
7. `supabase/sql/pj_review_reward_fk_indexes.sql`: lookup indexes.
Use a carefully verified Production-specific migration that respects existing objects and ownership, rather than blindly replaying Testing SQL headers. Recheck RLS, permissions, current Production schema and function body signatures at execution. Never include `pj_review_sandbox_catalog_isolation.sql` or Testing-only CNS alignment.
Never install checkout/reward-importer source before its database dependencies are confirmed.

## Exact candidate application scope — surgical review, no blind wholesale overwrites
- `assets/js/cart-engine.js`: isolate only zero-dollar native cart line, authentication/checkout payload and order snapshot changes; retain Main's unrelated Cart changes.
- `cart-page.html`, `assets/js/pj-review-cart-dev.js`: add native cart reward adapter and supporting script, leaving Main's existing cart layout/handlers alone.
- `assets/js/pj-review-board-live.js`, `assets/js/pj-review-data.js`: Board runtime, authoritative Review Service calls and selection adapter.
- `review.html`, `account.html`: revised return-to-Review-Board navigation; preserve existing account and authentication flows.
- `assets/js/pj-product-review.js`: inspect product-page links/buttons against owner's directive **not** to enter the questionnaire from a product page; do not promote unrelated product rendering changes.
- `assets/js/post-payment-cart-clear.js`: import-confirmed cart removal only; Production/Testing origin is resolved by environment.
- `assets/js/pj-auth.js`: preserve Main identity/session security; only include indispensable environment alignment if Main lacks it.
- Backend: `supabase/functions/pj-review-service/index.ts`, `supabase/functions/square-checkout/index.ts`, `supabase/functions/square-current-transaction-ingest/index.ts` and its `deno.json` plus shared dependencies, `supabase/functions/checkout-order-confirmed/index.ts`. These are distinct Supabase deployments, not automatically activated by a GitHub Main file change.
- `assets/css/pj-review.css` and `assets/js/pj-product.js` are unchanged between branch trees, so no need to promote them.
- Keep `scripts/pj-review-unified-checkout-guard.mjs` as Dev audit evidence; don't run acceptance fixtures in Production.

## Deliberate exclusions / never-promote list
- No Loyalty Bridge, PJ Credits migrations, wallet, discounts or frozen Phase 3 code.
- No State badges, unrelated badge UI, Square identity importer, shop/catalog inventory or unrelated product page rewrites.
- No Testing-only functions `pj-review-one-time-acceptance`, `pj-review-one-time-payment`, `pj-review-sandbox-checkout`, or `pj-review-sandbox-transaction-ingest`.
- No Testing Sandbox fixtures, Sandbox credentials, Sandbox users, synthetic purchases/reviews, or Testing-only SQL alignment. Exact project-isolation guards already in the Dev checkout/importer prevent Sandbox branches from activating in Production, but still verify environment-specific secrets and deploy target.

## Rollout sequencing and recovery
(1) Record current Production schema/function versions and Main commit; (2) install additive review-award database objects and verify counts/permissions; (3) deploy the existing Service/checkout/importer/confirmation Production function updates (configuration and migration prerequisites checked); (4) selectively promote the minimal frontend file changes to Main via explicit owner approval; (5) confirm live endpoints. If partial failure occurs, disable Review Board entry and revert only its frontend/backend pieces without breaking paid checkout; do not drop or destructively roll back tables containing customer records. Freeze and investigate rather than overwriting any concurrent Dev or Main work.

No Production SQL executed; no Production function or Main branch modified during this audit.
