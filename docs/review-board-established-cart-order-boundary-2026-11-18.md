# Pepper Junction — Review Board reward ownership boundary
**Scope:** Sauce-Bar-Dev only. **Status:** source implementation, not approved for Main/Production.

## Authoritative established flow
1. Review Board/review.html checks reviews and issues earned entitlement; customer selects an eligible product. **No Square payment logic here.**
2. PJCart holds the reward as one genuine $0.00 line alongside ordinary paid merchandise.
3. PJCart.startCheckout uses only existing square-checkout to create the normal Square-hosted order. It verifies reward ownership and correct discount as a *cart-validation responsibility*, not payment.
4. The **existing** service-role `square-current-transaction-ingest` validates the Square order/payment through its established acceptance process; `record_square_purchase` records paid merchandise. Its existing reward exclusion trigger removes the precisely matched free purchase line from badge and credit evidence.
5. When this same import succeeds, the importer calls the existing atomic `pj_review_reward_finalize_verified_order` RPC for the reserved, correctly discounted $0 reward line. There is no second payment verifier and no browser-authorized redemption.
6. The original read-only `checkout-order-confirmed` returns true only after the accepted purchase is attached and, for a reward-bearing order, the entitlement is redeemed. The browser then clears only an unchanged original cart snapshot.

## Protected dependencies / pre-promotion requirements
- The reward entitlement, checkout-attempt, free-line exclusion and finalization SQL must be present in the target database **before** corresponding Edge Function deployment. Production currently does not have these. No Main/Production changes authorized by this Dev commit.
- Reward redemption still depends on the **existing** importer matching Square customer identity to a verified PJ account; a Square payment alone is not an accepted imported PJ purchase. This must be demonstrated during isolated end-to-end acceptance, not bypassed.
- Verify Square discount isolation, same-product paid+free lines, replay/idempotency, failed/abandoned purchase, and the importer's existing purchase-recording and purchase-evidence paths before release.
- Do not deploy production-credential square-checkout or square-current-transaction-ingest source into isolated Testing. Dev-only static/simulated regressions do not constitute live acceptance.
- Do not retire isolated Testing's older Sandbox checkout deployment until the replacement path is safely exercised and its consumers checked. Its source was previously removed from Dev.

## Do not modify
Main, Production, frozen Loyalty Bridge/PJ Credits, unrelated badge engines, Review Board award rules, original paid-only cart/checkout behaviour.
