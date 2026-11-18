# Review Board checkout architecture — Dev-only corrective audit
**Date:** 2026-11-18 UTC | **Branch:** Sauce-Bar-Dev | **Scope:** preservation and regression gating, not release acceptance.

## Current authoritative implementation
The previous correction already removed `supabase/functions/pj-review-sandbox-checkout/index.ts` from the Dev repository (commit `365a7363586b`). The active cart runtime no longer invokes that endpoint. The native `PJCart.startCheckout` calls the original `square-checkout` service with a separate `pj_review_reward` $0 line alongside paid products. The original Square payment-link creator is still used. Reward entitlement/ownership, row eligibility, Square price/stock/discount checks, payment-confirmed atomic redemption and cart-snapshot-safe return logic are in the Dev source.

## Preserved intentionally
Review Board achievement, selection, redemption SQL, Review Service, existing cart and paid-order Square path, verified-purchase importer, zero-price reward exclusion, and historical Sandbox test/evidence files. These are not an alternate live checkout path. Do not remove them as part of a generic Sandbox cleanup. Loyalty Bridge/PJ Credits is frozen and excluded.

## Residual isolated deployment
`pj-review-sandbox-checkout` v26 remained ACTIVE in the **isolated Supabase Testing project** during this audit, despite its source being absent from Dev. It is not invoked by the current Dev cart runtime. Do NOT mistake deleting the GitHub source for deleting the hosted Testing endpoint. Do not retire or replace that deployment until the native unified checkout has independently passed a genuine end-to-end test in a safe approved environment and its external callers/dependencies have been checked. In particular, do not deploy Production-Square-credential checkout into isolated Testing or attempt to use Production as a test environment without distinct owner authorization.

## Release gate
Production `square-checkout` v9 is still the older paid-only deployed implementation, and Production does not have the Review Board reward tables. Dev source is not deployed operationally. Thus static code checks do not establish customer-ready rewards. **NO-GO for Main/Production reward checkout promotion.** Never merge Dev wholesale: unrelated work and frozen Loyalty Bridge are present.

Run `node scripts/pj-review-unified-checkout-guard.mjs` before any further review checkout edits or selective promotion. This is a read-only, static architecture regression guard, **not** a substitute for hosted Square/payment/return/importer acceptance tests.

Historical reports in `docs/review-board-*-2026-11-17.md` document the earlier Sandbox architecture and must not be treated as current unified-flow acceptance. No Main, Production, Testing database or deployed function mutations were performed by the static Dev guard.
