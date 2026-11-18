# Pepper Junction Review Board — isolated Square Sandbox importer integration

**Date:** November 17, 2026  
**Environment:** Sauce-Bar-Dev + isolated Supabase Testing `slubpfmpjgoupujptayy`.  
**Main / Production:** Unchanged.  
**Frozen Loyalty Bridge / PJ Credits:** No source, state, or schema changed.

## Implemented
Created `supabase/functions/pj-review-sandbox-transaction-ingest/index.ts` by adapting the existing Dev `square-current-transaction-ingest` code. It is a separate deployment at Supabase Testing, **ACTIVE version 2**. The original live/Testing current-transaction importer was not replaced.

The adapter:
- Uses only `https://connect.squareupsandbox.com`, `SQUARE_SANDBOX_ACCESS_TOKEN`, and `SQUARE_SANDBOX_LOCATION_ID`. It does not contain the Production Square API URL or Production credential names.
- Refuses to run outside the exact Supabase Testing project.
- Requires service-role authorization (no public test bypass).
- Requires a **completed Square Sandbox payment ID**; retrieves payment from Square independently, checks order ID, location, currency and full amount. An arbitrary order ID is insufficient.
- Resolves products through the existing two verified `pj_review_sandbox_catalog` fixtures, **not** `square_product_mappings` and never alters the latter.
- Requires an explicit `pj-review-ingest-...@example.invalid` test account with a valid Square customer identity link and an active/verified Review Board checkout attempt for the exact order.
- Requires exactly one positive-price fixture paid line and one zero-price fixture complimentary line with the approved Square item-level discount.
- Uses the real governed CNS product snapshot by product slug, avoiding a false comparison between immutable live Square item IDs and the Sandbox fixture catalog IDs.
- Calls the existing `record_square_purchase` recorder and `recordPassengerMerchandiseEvidence` intake with normalized lines; the existing before-insert triggers exclude the matched reward.

## Checks completed
- Function deployed and bundled with all four real shared code modules; Testing ACTIVE v2.
- Verified both Sandbox fixture items are marked verified, have positive underlying catalogue prices, appear on the Review Board, and have **zero collisions** with regular Square product mapping IDs.
- Deployed source inspection confirms Sandbox URL, Testing-project guard, test-only customer restriction, reward-attempt check and exact-completed-payment requirement.
- Real HTTP unauthenticated request returned **403 Service-role authorization required** (twice during development, including v2).
- Previous rollback-only Testing SQL used the real `record_square_purchase`, award guards, `pj_review_status_for_customer`, `pj_credit_evaluate_verified_purchase`, and replay checks, confirming paid lines benefit normally, matched rewards are excluded, and no duplicate credits occur. See `docs/review-board-post-payment-regression-2026-11-17.md`.
- Confirmed no temporary ingestion test customers, purchases, purchase lines, exclusions, credit events or checkout attempts were left behind.

## IMPORTANT — final gap, no overclaim
**A completed Sandbox payment has NOT yet been successfully submitted through this new deployed importer with the required service-role authorization.** The current database-only test interface cannot legitimately supply that authorization, and we did not weaken it or expose a bypass.

Accordingly, this phase is **implementation plus security/isolation verification completed**, not a passed live HTTP Square Sandbox → adapter → recorder end-to-end test. Do not describe the full importer pipeline as validated until a controlled authenticated invocation is executed.

## Remaining acceptance procedure
Use a properly authorized service process in Supabase Testing only:
1. Create a disposable test user and matching Square Sandbox customer identity link.
2. Earn/set the Testing-only reward entitlement and create an authentic Sandbox checkout link.
3. Complete a Sandbox payment for the combined paid + $0.00 reward order.
4. Invoke `pj-review-sandbox-transaction-ingest` with its service-role credential and actual `square_payment_id`, never from a public browser.
5. Verify one paid line retained, reward excluded from `purchase_line_items` and railroad evidence, paid review eligibility/credits preserved, reward never qualifying for review or credits.
6. Invoke the same payment again: verify no duplicate purchase, badges or credits.
7. Clean up fixtures in accordance with immutable ledger/audit-record controls; do not silently disable ledger protections.

## Recovery
- New adapter Dev commits: `4c015625d8d4523205753c28fbcaf3b9c5951d6b` (initial) and `35e6b3bfcbb0b0c004a927be94bdd93fa22a27d0` (strict completed-payment hardening).
- Deployed Testing `pj-review-sandbox-transaction-ingest` v2 is isolated and not called by Production.
- Original `square-current-transaction-ingest` remains untouched.
- Nothing is eligible for Main promotion without separate review and explicit owner Go Ahead.
