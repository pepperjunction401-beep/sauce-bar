# Pepper Junction Review Board — isolated Sandbox end-to-end test
**Date:** 2026-11-17  
**Environment:** Sauce-Bar-Dev + Supabase Testing `slubpfmpjgoupujptayy` + Square Sandbox.  
**Production/Main:** Not modified. No live funds moved.

## Verified sequence
1. Supabase Auth creates a real, authenticated temporary Testing customer.
2. Eight independently inserted questionnaire records for Board row 1 trigger the normal row-achievement/entitlement creation.
3. Actual deployed `pj-review-service` Board API recognizes eight submissions, completed row and entitlement.
4. Actual `pj-review-service` `reward-select` API selects the catalog-verified free item.
5. Actual `pj-review-sandbox-checkout` `create` API creates a Square Sandbox payment link with one paid $9.99 item and one $0.00 reward (100% item discount, not a cart discount).
6. Square API returns the payment-link order in `DRAFT`. **Test-only** Square UpdateOrder moves the disposable order to `OPEN`; this simulates a prerequisite Square normally performs during hosted checkout. It is not a full browser checkout test.
7. Square Sandbox declined card returns error; subsequent authenticated `confirm` returns HTTP 409 and entitlement remains `selected`.
8. Square Sandbox approved card yields `COMPLETED` payment associated with that order.
9. Authenticated `confirm` verifies Square order, zero-price reward line, paid line and completed tender, then atomically marks entitlement `redeemed`.
10. Replaying that same confirmation returns HTTP 200 and `alreadyConfirmed:true`; no second redemption occurs.

**Outcome:** All 10 recorded test stages passed using deployed Testing services and actual Square Sandbox APIs. This validates the backend protocol—not Square-hosted browser checkout or the public site flow.

## Cleanup and controls
- The one-time, temporary Testing-only runner was redeployed out; function `pj-review-sandbox-checkout` restored to the exact Dev source (Testing version 22).
- Four temporary test users (one created during preliminary setup; three full-test attempts), 24 synthetic reviews, 3 achievements/entitlements, 3 checkout attempts and associated purchases were deleted from Supabase Testing after a rollback-verified cleanup.
- The two independently verified Sandbox fixture catalog items remain to support subsequent tests.
- Production has none of the new Review Board Sandbox/reward tables.
- Previous purchase-line exclusion regression passed, but the **full post-payment importer, all badge/credit families, website UI and hosted browser checkout are not yet end-to-end verified.** Do not treat these tests as authorization to promote.

## Troubleshooting notes
- Supabase auto-creates customer profiles when auth users are created: update/upsert the profile, don't insert a duplicate.
- Square PaymentLink initially creates a DRAFT order; direct Payments API refuses DRAFT orders with `The order must be OPEN to be paid`. Direct API tests may update a disposable DRAFT order to OPEN. Hosted browser checkout behavior remains separately testable.
- Test-price fixture: paid $9.99 and complimentary $12.99 (discounted to $0.00); amounts are not live retail prices.
