# Pepper Junction — PJ Credits / Loyalty Bridge purchase acceptance

**Scope:** Sauce-Bar-Dev and isolated Supabase Testing only. No Main, Production, Netlify, customer checkout edits, or independent payment architecture.

## What is already proven

- Controlled, rollback-only Testing fixtures exercise the existing `record_square_purchase` -> `purchase_import_events` -> Phase 3 PJ Credits ledger/wallet -> `pj_loyalty_my_collection` handoff.
- In a 48 + 3 test, wallet reached 51; two 50-credit bridges became balance-qualified; duplicate import/retry did not grant twice.
- Cap tests: 273 + 3 granted only 2 to reach 275; a later purchase at cap recorded a zero-credit evaluated entry; retried purchases could not re-award after a synthetic balance reduction.
- Incomplete credit snapshots were held instead of guessed; all synthetic rows were rolled back.
- These are **database integration tests**, not proof of Square's actual confirmation or physical gift/discount fulfillment.

## Live Square-confirmed acceptance — not yet executed

Prerequisite: an **actual authorized Square-confirmed completed purchase** already attached by the existing Phase 1/2 Railroad to a verified customer in the target testing environment. **Do not** enter a fake order, spoof a payment event, alter Phase 1/2, create a payment link, or route a Production Square purchase into an unapproved environment.

1. Retain independent evidence of the completed Square order/payment and the customer it is attached to.
2. Confirm existing Phase 1/2 shows the same order as `completed` and `attached`, with a verified customer and accepted Square identity; no ownership override.
3. Inspect line-item mapping to current CNS products, quantities, source snapshot PJ Credit rates, price and promotional-line classification. Do not invent rates or let zero-dollar reward products create credits.
4. Run `pj_credit_square_acceptance_readonly.sql` against **Supabase Testing only**, replacing only the clearly marked Square order ID placeholder. The query reports why it cannot pass; it cannot award, debit or alter records.
5. Expect one `purchase_earn` entry for the eligible purchase, correct requested and credited amounts, a wallet never exceeding 275, and no duplicate ledger entry after an upstream legitimate retry.
6. Sign in to the *Dev/Testing* Passenger Station from a supported local first-party origin. Verify the displayed wallet balance and all 15 bridge cards reflect the server-returned eligibility; do not trust the illustrative markup.
7. Validate account isolation, no access without verified identity, no new badge/credit behavior for an unconfirmed transaction, and no change to existing badge-family results.
8. Record evidence and outcome. Promote **nothing** to Main/Production without the owner's explicit Go Ahead.

## Environment limitation discovered

- Testing currently has **no verified customer and no accepted transaction** available for a live Square-to-Railroad test.
- The installed `square-sandbox-match` function searches **Square Sandbox customer identity**, but the existing `square-current-transaction-ingest` function addresses `connect.squareup.com` using `SQUARE_PRODUCTION_ACCESS_TOKEN`. This **does not provide an approved Sandbox payment intake**.
- The established Railroad is not to be redesigned just to satisfy this test. An actual Square payment test or approved Sandbox integration contract requires distinct authorization and accurate environment isolation.
- Current credit subscriber processes accepted `webhook` / `signed_in_checkout` events only. Historical earning (D07), redemption/reactivation (D01), settlement/fulfillment and refund policies remain outside this acceptance.
- The read-only audit confirms *database* evidence; the Square receipt and browser UI must be independently checked.

## Exit criteria

**Pass only** if independent Square confirmation, accepted Railroad ownership, exact-once credit ledger, wallet arithmetic, current balance-qualified bridge state and verified Dev customer UI all agree. Otherwise report the specific unproven gate. Never claim an unrun real Square integration passed.
