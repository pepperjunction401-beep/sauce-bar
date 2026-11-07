# G9 Test 1 — Genuine authenticated, purchase-backed post-payment acceptance
**Date:** November 7, 2026 (Eastern/UTC)  
**Environment:** GitHub `Sauce-Bar-Dev` + **isolated Supabase Testing** `slubpfmpjgoupujptayy` only.  
**Production/Main/Square:** NOT touched. This was a **synthetic Testing ledger purchase**, not an actual Square payment/import.

## Final result: PASS

[Successful GitHub Actions run #42345446153](https://github.com/pepperjunction401-beep/sauce-bar/actions/runs/42345446153)

An isolated test runner created a unique disposable Auth user with a runtime-only random password. The operator then confirmed the isolated Auth user and set its profile to `verified_matched` after verifying account identity. Before any Testing purchase existed, the signed-in runner invoked the **deployed** JWT-required `post-payment-awards-read` Edge Function and obtained `status=pending`, no awards.

The operator next inserted one fully scoped **synthetic** (zero-amount, no product line items, no checkout-timezone evidence) completed/attached purchase into the existing Testing `public.purchases` ledger with a Rhode Island US shipping destination and timestamp after the October 8, 2026 cutoff. No new importer/checkout service or payment verification was created or called. The existing purchase trigger enqueued G9; `pj_state_process_queue(1)`, the already-approved worker function, changed queue state to `done` with `result=credited`, State award credit `RI / level 1`, and collection level 1. No other badge family awarded anything.

## Verified against real deployed services and actual browser HTML

1. **PASS:** Genuine Supabase Testing password sign-in and verified customer identity.
2. **PASS:** Genuine Edge request before the purchase returned **pending + zero awards**, not a forged or assumed completed checkout.
3. **PASS:** After ledger acceptance and normal G9 evaluation, the real purchase-scoped, JWT-authenticated Edge reader returned exactly one `state_entry` award for `RI`, `level=1`, with the registry artwork path and attribution to the exact synthetic order.
4. **PASS:** The real authenticated `pj_state_my_collection()` Depot RPC independently returned RI Level 1.
5. **PASS:** Requesting an unrelated order ID returned `pending` with no award. Previous earned state did not leak.
6. **PASS:** Headless Chromium opened the actual Dev `post-payment-badges-testing.html`, submitted the test account's credentials to the real Supabase Testing Auth service, and called the deployed Testing Edge Function. Only Rhode Island Level 1 was shown, with artwork and working flip interaction. No retry button remained when processing was complete.
7. **PASS:** The same Chromium browser signed in to the standard Dev first-party `PJAuth` client and opened the actual `passenger-station.html`; Rhode Island was visibly earned at Level 1, Connecticut stayed locked, and all 50 State cards were present.
8. **PASS:** Both UI destinations agreed on the same authoritative award level. Browser networking allowed only localhost, isolated Supabase Testing, and the public Supabase JS CDN. Pepper Junction Production and Square were not contacted.

## Safety and lifecycle observations

- Zero-dollar test purchase with no merchandise rows was **explicitly synthetic**. This is a *ledger-to-awards integration test*, **not** proof that Square actually accepted payment; real paid Square proof remains Test 7.
- Existing unrelated purchase triggers were not disabled or changed. The insert queued one Passenger reconciliation job, which was tracked and cleaned; no unrelated earned badge records appeared.
- The synthetic purchase's G9 record had `state_queue.status=done`, `result=credited`, and `awarded_level=1`, once.
- The runner's first attempt `42345279562` was superseded because the initial script generated an opaque random test order inaccessible until the live job finished. Its orphaned disposable Testing Auth account was independently verified to contain no purchase/award data and then deleted. The successful retry derives its **synthetic** order reference from the disposable user ID for operator coordination.
- Both disposable Auth accounts were removed with exact email and ID guards. Cleanup transaction for the successful attempt deleted **only** its G9 queue, credit, level, Passenger queue, one synthetic purchase, and associated Auth account. The original Testing users/profiles were untouched.

## Final isolated Testing counts

| Item | After cleanup |
|---|---:|
| Auth users | 2 (original count) |
| Customer profiles | 2 (original count) |
| G9 Test 1 disposable accounts | 0 |
| Purchases | 0 |
| G9 evaluation queue | 0 |
| G9 purchase credits | 0 |
| G9 customer levels | 0 |
| Passenger reconciliation queue | 0 |
| Other badge awards (observed) | 0 |

The G9 Test 1 workflow `.github/workflows/g9-test1-real-purchase-backed.yml` has been restored to **manual-only** and requires a deliberate operator acknowledgment matching the test harness guard. No unattended account creation or automatic purchase fixture.

## Remaining before production release

- **Test 2:** Exhaustive all-50-states / nine-division-secret coverage and repeated state-level increments, including exact checkout attribution and no secret previews.
- **Test 3:** Real delayed/failed/recovered G9 worker, queued checkout readiness and safe customer retry.
- **Test 4:** Cross-family regressions and phone/tablet/desktop layout; navigation/session/cart-clear coordination.
- **Test 5:** Real deployed endpoint negative/security probes: wrong customer, unpaid and malformed orders, signed-out/revoked identity and origin gates.
- **Test 6:** Operational scheduling, reconciliation, October 8 cutoff and backfill rehearsal in isolated Testing only.
- **Test 7:** A genuine paid Square checkout, only after separate approval for Production deployment and paid live acceptance.

Nine division-secret artworks remain an owner-design dependency; fallback is currently earned-only text.

**No Main merge or Production change is authorized by any of these test results.**
