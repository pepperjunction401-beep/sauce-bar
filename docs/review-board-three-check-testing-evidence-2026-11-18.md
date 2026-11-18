# Review Board — controlled Testing acceptance snapshot (November 18, 2026)

**Branch:** `Sauce-Bar-Dev`; **testing Supabase project:** `slubpfmpjgoupujptayy`. No Main/Production/Loyalty Bridge deployment, write, or promotion.

## Existing architecture preserved
Native PJCart -> existing `square-checkout` -> Square-hosted checkout -> existing verified `square-current-transaction-ingest` -> purchase recorder + atomic reward redemption -> read-only `checkout-order-confirmed`.
The isolated Testing function instances choose Square Sandbox credentials only on exact Testing project. Local browser (`localhost:8000` or `:8080`, also `127.0.0.1`) routes native PJCart + checkout return to Testing, consistent with existing local PJAuth. Live domain keeps Production.

## Genuine Testing API evidence
- Native Testing `square-checkout` produced a valid Sandbox payment link and Sandbox order identifier for a normal paid item; HTTP **200** (two invocations, including localhost origin).
- Paid merchandise + claimed Review Board reward without an authenticated customer failed **401** before opening a payment link.
- Reward-only checkout failed **400** (paid merchandise required).
- Read-only confirmation on an **unpaid Sandbox order** returned HTTP **200**, `confirmed:false`, and did not clear or record the order.

**Do not upgrade these to completed-payment claims.** None of the Square Sandbox payment links were paid, no reward was consumed, and no verified full reward checkout was completed.

## Exact acceptance blocker
Testing presently has **zero** `verified_matched` customer profiles, zero `square_customer_links`, zero reward entitlements, and zero reward checkout attempts. The owner-approved Review Board and existing importer require a verified authenticated Testing customer, an earned selected reward, and a Square Sandbox customer identity linkage to finalize an actual reward order. A completed successful-reward checkout therefore **remains unverified**.

## Deployment record
Testing (only):
- `square-checkout` version 3, active, Sandbox URL/keys + verified in-memory two-fixture mapping and commercial-state placeholders.
- `square-current-transaction-ingest` version 7, active, Sandbox URL/keys + verified Testing fixture identity overlay, no production mappings changed.
- `checkout-order-confirmed` version 1, active, read-only status endpoint and Testing-local origin.
- Old `pj-review-sandbox-checkout` version 26 remains active in isolated Testing **pending a successful native reward transaction**; it is not called by PJCart. Do not retire it prematurely.
No Production function deployed.

## Three agreed acceptance checks
1. **Successful paid + $0 reward and consumption:** pending authenticated real Sandbox purchase/importer evidence.
2. **Failed/abandoned reward preserved:** browser simulations and fail-closed live endpoints passed; actual abandoned reward attempt still pending.
3. **Paid-only checkout unaffected:** real Sandbox payment link opens HTTP 200; paid settlement/importer not run.

## Release gate
**NO-GO** for promotion. Before final authorization, execute the two missing real Sandbox outcome checks with a dedicated Testing account and verified Square identity, and verify paid-only settlement/importer if that is part of the paid-only end-to-end acceptance. Do not perform live Production tests, fabricate a customer record, change frozen Loyalty Bridge/PJ Credits, or merge Dev wholesale. Capture commit SHAs and source only the approved Review Board-related files when preparing a promotion.
