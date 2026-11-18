# Pepper Junction Review Board — three-check acceptance record
**Date:** 2026-11-18  
**Branch:** `Sauce-Bar-Dev`  
**Environment:** isolated Supabase Testing `slubpfmpjgoupujptayy`; Square Sandbox.  
**Main/Production/Loyalty Bridge:** untouched.

## Owner-agreed minimum checks — results

| Check | Actual result | Evidence |
| --- | --- | --- |
| 1. Earned $0 reward alongside paid item, completed Square order, importer redemption | **PASS — Sandbox API integration** | Real Review Service reported Board row 1 with 8/8 qualifying slot credits and available entitlement. Reward Service selection succeeded. Existing `square-checkout` generated one Square Sandbox payment link with paid and $0 reward. Square Sandbox payment returned `COMPLETED`. Existing `square-current-transaction-ingest` returned HTTP 200, `succeeded/inserted`; entitlement became `redeemed` for the exact order. Read-only `checkout-order-confirmed` returned `confirmed:true`. |
| 2. Declined checkout retains entitlement | **PASS — Sandbox API** | Square Sandbox returned `GENERIC_DECLINE`; entitlement stayed `selected`. No redemption occurred on decline. |
| 3. Ordinary paid-only checkout unaffected | **PASS — Sandbox checkout creation** | Existing `square-checkout` returned HTTP 200 with a native Square Sandbox payment link for paid-only merchandise. No Review Board authentication or reward tables were needed. An unpaid order returned `confirmed:false`. |

### Verified purchase evidence
For the single completed reward order:
- **One** completed, attached purchase.
- **One** paid purchase line retained.
- **Zero** complimentary lines incorrectly recorded as paid/purchase lines.
- **One** precisely matched complimentary line excluded from downstream purchase badge and credit intake.
- **One** reward entitlement redeemed for the same Square order.
- **One** verified reward checkout attempt in state `paid_verified`.

### Scope and limitations
The payment was completed using the **Square Sandbox Payments API** against an actual Square Sandbox order created by the existing checkout; this does not independently prove the customer-facing Square-hosted browser payment screen, browser redirects, or UI layout. This acceptance campaign deliberately follows the owner's three-check limit.

A disposable, isolated Testing user and its synthetic qualifying review/test-purchase records were created specifically for the acceptance proof. These remain in Testing for reproducible audit evidence and have no Production connection. Never merge or migrate synthetic Testing data to Production.

### Cleanup verified
- Previous parallel `pj-review-sandbox-checkout` function, Testing version **27**: deployed as a no-operation retirement stub. Its endpoint returns HTTP **410** `RETIRED_PARALLEL_CHECKOUT` and cannot create payment links.
- Temporary acceptance fixture runner `pj-review-one-time-acceptance`, version **2**: replaced with HTTP **410** retirement stub.
- Temporary payment runner `pj-review-one-time-payment`, version **2**: replaced with HTTP **410** retirement stub.
- These endpoints remain registered in Supabase Testing but are **functionally disabled**; no active temporary runner implementation or exposed test credential remains in their deployed version.
- The old parallel checkout source was already deleted from the Dev GitHub tree. Preserve historic test reports only as evidence, not as implementation instructions.

### Promotion package and release gate
Review Board source changes are Dev-only. A selective promotion must account for:
- Existing native Cart reward line and Board adapter / Review Service.
- Existing checkout handling of reward identity, Square item-level $0 discount and checkout attempt reservation.
- Existing Square current transaction importer that verifies the order and atomically finalizes redemption after purchase recording.
- Existing read-only post-payment order confirmation plus unchanged-cart protection.
- Review Board entitlement, checkout-attempt, and complimentary-purchase-exclusion database dependencies.
- The isolated Testing-only Square credential, fixture, and commercial-state branches must never activate in Production.
- Preserve the frozen Loyalty Bridge/PJ Credits, all unrelated badge families, and unrelated concurrent Dev changes.
- **Do not wholesale-merge the diverged Dev branch.** Record exact blobs and evaluate Production schema rollout order during the owner-approved selective promotion.

**Technical assessment:** the owner's three agreed Sandbox API acceptance checks are satisfied. **Promotion remains owner-authorized only**; no Main/Production deployment or migration has been performed.
