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
5. Import private register into a **separately approved** staging loader. A trusted loader has **not** yet been built or deployed; no customer records are currently imported.
6. Owner review/approval of ambiguous identity cases, overlap boundaries, existing PJ balances, and approved 275-point conversion.
7. Build, test and separately approve one-time idempotent transfer writing through the **existing** PJ Credits ledger, never a second wallet or a new Square loyalty engine. A claim function and historical CNS-only evaluator are **not yet built**.
8. Only after tests and explicit owner Go Ahead, promote tested Dev through Main and coordinated Production cutover. No Netlify.

## Non-goals / boundaries
- Does not alter Phase 1/2 identity, Railroad importer, Square webhook, Square payment confirmation, other badge families, or badge Depot.
- Does not automatically classify people without verified Square links or before a validated cohort exists.
- Does not grant credits, redeem rewards, reserve unpaid checkout value, generate purchase history, or reactivate the paid Square subscription.
- Legacy snapshot 'sealed' means frozen membership evidence, **not** approved launch. Both switches remain off unless explicitly authorized.
