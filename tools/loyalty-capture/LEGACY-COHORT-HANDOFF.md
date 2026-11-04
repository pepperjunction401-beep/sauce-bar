# PJ Credits — Legacy Square Loyalty cohort handoff (03 Nov 2026)

## Owner intent
- **One fixed group:** existing members of the discontinued Square Loyalty program, including zero-balance members; membership does not depend on future website registration date.
- **Authoritative currency:** capture **currently available Square points**, not recomputed lifetime points or historical gross purchases.
- **Other established customers:** historical PJ Credits recovery only for accepted completed transactions with products recognized by the current approved CNS; subject to existing credit earning and identity rules.
- **New customers:** regular PJ Credits from accepted new purchases, not historical deep dives.
- **275 maximum** applies to everyone; owner personally handles unusual over-cap customers; no overflow wallet.
- **No double awards:** old purchases included in the Square balance cannot also earn PJ historical credits. Identity from existing Square customer linking, not inferred by name or phone.
- **All NEW legacy credit routing stays OFF** until the full Square snapshot is captured, validated, and owner authorizes cutover.

## What's implemented / verified in Dev + isolated Testing
1. Private `pj_legacy_loyalty_snapshots`, `pj_legacy_loyalty_members`, and `pj_legacy_loyalty_activation` tables. Membership data does not appear in authenticated browser tables.
2. `pj_legacy_loyalty_classify(customer_id)` server-only reader: pending snapshot; identity unverified; legacy member; nonmember CNS-only; manual review.
3. Additional guard holds classification when a Square customer ID is linked to more than one website customer.
4. Snapshot seal validates complete **account** pagination, expected account count, unique Square customer IDs, complete nonnegative balances and lifetime values; seals members immutably. Event/reward history is optional for **membership** sealing and remains available for later reconciliation.
5. `pj_legacy_loyalty_my_status()` exposes only the authenticated user's safe classification; it **does not** reveal points or claim an award.
6. Standalone Square search capture (accounts first); offline `prepare-register.mjs` translates private response pages into private register JSON, including `--accounts-only` if events/rewards are still downloading.
7. Offline mock tests in GitHub Actions for pagination, all source totals, 275 cap, duplicate IDs, negative balances, partial optional history and paused-program rejection.
8. Staging SQL tests ran inside an explicit ROLLBACK; Testing contains **zero** legacy rows, **zero** PJ wallet rows and **zero** PJ ledger rows; both legacy switches disabled.

## Procedures when Square resumes — NOT AUTHORIZED FOR AUTOMATIC EXECUTION
1. Confirm Square program ACTIVE and authorize read-only LOYALTY_READ token. Never upload tokens or customer data to GitHub.
2. Run `node tools/loyalty-capture/square-loyalty-capture.mjs --out=/PRIVATE/CAPTURE` on a private machine.
3. **As soon as accounts pagination is complete**, `node tools/loyalty-capture/prepare-register.mjs --from=/PRIVATE/CAPTURE --out=/PRIVATE/REGISTER --accounts-only`. Check account count, duplicate identifiers, negative values and archival fingerprints; encrypt an offline backup. Don't have to wait for lifetime event-history download.
4. Validate a sample against Square Dashboard and confirm the single correct frozen cohort. Account source timestamps and capture date matter: do not replay covered history as earnable PJ credits.
5. Operator-approved Testing-only staging loader now exists at `tools/loyalty-capture/stage-register-testing.mjs`. It accepts the privately prepared `register.json`, only targets isolated Testing `slubpfmpjgoupujptayy`, and calls service-role staging RPCs in batches. Import is not yet performed because the Square program is paused; no real customer records are currently imported.
6. Owner review/approval of ambiguous identity cases, overlap boundaries, existing PJ balances, and approved 275-point conversion.
7. One-time transfer function `pj_legacy_loyalty_claim_verified` now exists in isolated Testing and writes a distinct `legacy_square_transfer` event through the **existing** PJ Credits ledger only when `transfers_enabled=true` (currently FALSE). Synthetic rollback tests confirmed balance cap, one ledger event, retries return already claimed, and updated classification shows claimed.
8. CNS-only nonmember historical earning now uses the **existing** `pj_credit_evaluate_verified_purchase` in Testing with a separately required `history_cutoff_at` and `nonmember_history_enabled` (currently FALSE). Chronological synthetic rollback tests succeeded; no automatic replay trigger was added.
9. Remaining prelaunch work: reconcile Square capture versus live PJ ledger activity; validate historical purchase ordering/legacy product coverage and customer matching; execute a controlled complete-archive test with real Square LOYALTY_READ permission; coordinate operator-triggered account sign-in transfer; separately approve the ledger cutover switch, history cutoff and any reconciliation exceptions. Once complete and explicitly authorized by owner, promote reviewed Dev to Main / coordinate Production activation. No Netlify.

## Non-goals / boundaries
- Does not alter Phase 1/2 identity, Railroad importer, Square webhook, Square payment confirmation, other badge families, or badge Depot.
- Does not automatically classify people without verified Square links or before a validated cohort exists.
- Default/installed state does not grant legacy credits, redeem rewards, reserve unpaid checkout value, generate purchase history, or reactivate paid Square Loyalty. The disabled claim worker can award once only after explicit future operator activation and a sealed cohort; it is not wired to automatic sign-in yet.
- Legacy snapshot 'sealed' means frozen membership evidence, **not** approved launch. Both switches remain off unless explicitly authorized.

## 04 Nov / current Testing verification
- Staging begin/batch/status: passed synthetic tests, replay idempotence, conflict refusal and account-first seal, all rolled back.
- Synthetic full legacy transfer: 340 Square points became 275 PJ Credits exactly once; retry was already claimed; synthetic state rolled back. Separate 30-point scenario confirmed claimed status projection.
- Synthetic nonmember history: inactive gate refused; with temporary activation inside a rollback transaction, two mapped completed history orders earned 5 then 7, duplicate refused, older out-of-order credit held.
- No permanent synthetic data or credit changes; private browser read privileges remain revoked. Both switches OFF.
- Important limitation: live Square retrieval and real customer matching remain untested while Square Loyalty is paused. Full end-to-end signup/transfer orchestration remains to be built and separately authorized.

## 04 Nov — authenticated sign-in and exchange preparation (Dev / isolated Testing only)

- `pj_loyalty_my_onboarding()`: authenticated-only, security-definer handoff validates `auth.uid()` against existing `customer_profiles.account_state='verified_matched'`. Before a sealed snapshot it returns pending without awarding. After owner activation, only the verified customer's existing one-time transfer worker may be invoked. Nonmember historical earning remains a separate controlled replay, never an automatic sign-in replay.
- `account.html` in Sauce-Bar-Dev calls onboarding after existing Phase 1 identity matching and before the preserved destination redirect; errors do not block sign-in. No browser service-role key or customer-controlled IDs.
- New independent `pj_loyalty_bridge_activation` defaults `display_enabled=false` and `exchange_enabled=false`. No activation performed.
- `pj_loyalty_my_collection()` now returns `prelaunch_locked` while the bridge display gate is disabled; all 15 Bridge token cards remain locked. The Depot wording distinguishes prelaunch from unverified identity.
- `pj_loyalty_my_exchange_quote(token_number)` uses server-side verified identity, live wallet balance and canonical 15-token registry; it is a **read-only qualification preview**. It always returns `exchange_possible=false`, never debits credits or issues products/discounts.
- Synthetic transaction tests (rolled back) verified unauthenticated rejection, verified-user prelaunch pending status, locked Depot, disabled exchange quote, as well as an intentionally simulated fully open 275-credit state returning qualifying 225/50-credit quote data with no award.
- Remaining: approved reward-delivery integration and payment/order binding for one-token-per-transaction exchange; idempotent redeem/fulfillment transaction and rollback/reconciliation tests; owner approval of launch switches. **Do not** build unpaid-cart or payment-link point reservations.
- Browser test: `tools/loyalty-capture/tests/test-loyalty-signin-bridge.mjs`; GitHub Actions runs capture/register/onboarding regression checks. No Main merge or Production changes.
