# Pepper Junction — Review Board post-payment safeguard verification

**Date:** November 17, 2026  
**Environment:** isolated Supabase Testing project `slubpfmpjgoupujptayy`, read-only Dev review and rollback-only SQL transactions.  
**Change boundaries:** no Production, no Main, no frozen Loyalty Bridge/PJ Credits implementation changes.

## Overall outcome
**PASS for the tested database intake and reward safeguards.** The direct Square API → actual importer normalization → purchase recorder path is **not yet end-to-end verified** because the two Sandbox fixtures intentionally do not appear in `square_product_mappings`.

## Verified, with actual Testing database procedures and triggers

1. **Matched free line exclusion:** The existing `pj_review_reward_skip_zero_line` BEFORE INSERT trigger removed the earned $0.00 reward from `purchase_line_items`, logged the `square_line_item_uid` and purchase in `pj_review_reward_excluded_lines`, and kept the $9.99 paid item. Checked on both direct insert and the actual `record_square_purchase` function.
2. **Railroad evidence:** `pj_review_reward_skip_passenger_evidence` dropped the matching zero-dollar reward evidence and preserved the paid merchandise evidence. Current transaction ingestion calls `record_square_purchase` before `recordPassengerMerchandiseEvidence`, so the exclusion ledger exists when evidence inserts occur.
3. **Unrelated zero-dollar merchandise:** A zero-dollar line for a different product was not classified as a Review Board reward and was retained (no indiscriminate zero-price suppression).
4. **Same-product case:** Two lines referring to the same product (one $12.99 paid and one 100% discounted to $0) resulted in one paid line retained and one matched reward line excluded.
5. **Review eligibility:** Actual `pj_review_status_for_customer` returned eligible for the paid product and ineligible for the solely complimentary product from one recorded order.
6. **PJ Credits:** A simulated purchase with actual accepted Square identity, rate snapshot 5 for the paid line, rate snapshot 200 on the reward, passed through the actual `record_square_purchase` function. The existing automatic evaluator recorded **exactly one purchase-earn event of 5 credits** (no credits from the free reward). Calling `pj_credit_evaluate_verified_purchase` again returned `already_evaluated`. The frozen function was *read*, not edited.
7. **Purchase replay:** Recalling `record_square_purchase` with the same Square order returned `refreshed`, without creating extra lines or another credit ledger entry.
8. **Trigger-layer applicability:** Food and Heat item badge contributions and Milestone line-trigger processing are downstream of `purchase_line_items` INSERT. The matched reward does not reach those AFTER INSERT triggers. Railroad's merchandise evidence insert has its own upstream suppression. Purchase-level Celestial, Shop O'Round, State Entry and other order-level families can still evaluate the legitimate *paid order*; they do not receive a second purchase because the free product is in that same order.

## Preservation / cleanup
All synthetic customer/auth rows, purchase imports, paid and free lines, reward entitlements and credit events were created inside SQL `BEGIN`/`ROLLBACK` transactions. Afterwards: zero temporary rollback email users, zero Testing purchase lines, zero excluded lines, zero credit ledger events, zero passenger evidence, zero reward checkout attempts. No mutations to Main, Production, live checkout, or the frozen Loyalty Bridge source.

## Boundary still outstanding
Current Square Sandbox fixture catalog objects have **zero** matching active `square_product_mappings` each. This isolation is intentional, and must remain so until there is an approved Testing-only strategy. The existing `square-current-transaction-ingest` maps Square variants via `square_product_mappings` and currently rejects an unmapped product line. Therefore, *the HTTP Square Sandbox order → deployed transaction-ingest endpoint → real purchase recorder* has not been executed end to end. Instead, the real purchase recorder and database downstream effects were exercised with equivalent normalized paid/reward test lines in rollback-only transactions. The latest successful authenticated Sandbox checkout and redemption tests are separately documented.

No separate per-badge-family end-to-end HTTP award tests were run here. Do not promote on the assumption that all families have been exercised through Square's ingestion API. Next recommended task: plan an isolated Testing-only product-mapping/ingestion verification that cannot affect Production mappings or the frozen Loyalty Bridge.

## References
- `supabase/sql/pj_review_reward_exclude_free_intake_lines.sql`
- `supabase/functions/pj-review-sandbox-checkout/index.ts`
- `supabase/functions/square-current-transaction-ingest/index.ts` and `_shared/passenger-merchandise-evidence.ts`
- Testing functions: `record_square_purchase`, `pj_review_status_for_customer`, `pj_credit_evaluate_verified_purchase`
- `docs/review-board-sandbox-e2e-2026-11-17.md`

**Do not promote without explicit owner authorization.**
