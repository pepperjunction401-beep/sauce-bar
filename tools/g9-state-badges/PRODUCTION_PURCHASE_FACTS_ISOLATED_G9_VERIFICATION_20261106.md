# Pepper Junction G9 — Existing Paid Purchase Evidence Verification
**Date:** November 6, 2026  
**Scope:** Production READ ONLY; G9 evaluation in isolated Supabase Testing only.  
**Owner intent:** Existing live-paid orders may be used for testing; no Production/Main deployment or live badge mutation authorized.

## Evidence available in Production (read-only)

From `public.purchases` joined to `customer_profiles`, filtering completed purchases on/after the approved State Badge effective date using America/New_York business date:

| Source fact | Observed |
|---|---|
| Distinct accepted purchases | 5 |
| Distinct Square order IDs | 5 |
| Purchases with Square payment identifiers | 5 |
| Authoritative completion timestamp present | 5 |
| `purchase_status='completed'` and `import_status='attached'` | 5 |
| Verified matched customers represented | 1 |
| Destination | Rhode Island, US for all five |
| Accepted source channels | Two history-import records, three webhook records |
| Expected G9 level progression | RI 1, 2, 3, 4, 5 |

**No claim that the connected current user identity was independently established** from the Supabase profile. No personal addresses, customer IDs, or Square payment/order IDs are stored in this document.

## Test performed in isolated Supabase Testing

Actual completion timestamps, country/state values, and accepted source-channel types were read from Production in memory and mirrored into five ephemeral synthetic `purchases` with temporary identifiers and an existing isolated Testing profile temporarily marked `verified_matched` only inside a rollback-contained transaction.

The unmodified `pj_state_process_queue(50)` and State-specific trigger/evaluator processed the fixture:
- **PASS:** five distinct purchase credits
- **PASS:** Rhode Island Level 5, against expected Level 5
- **PASS:** distinct levels 1..5
- **PASS:** replay/update did not create duplicate credits or change Level 5
- **PASS:** zero division secrets awarded prematurely
- **PASS:** source data never copied with live customer IDs or live Square order IDs
- **PASS:** all Testing fixture writes and temporary profile-state changes rolled back

Final Testing read-only verification after the test: 0 purchases, 0 State credit rows, 0 level rows, 0 State queue rows, 0 secrets; regular Testing worker still active, Testing profile state restored.

## What this does and does not prove

**Proves:** Live accepted-production Square purchase records already contain the identity, completion, order reference, and shipping facts necessary for G9, and the isolated State evaluator produces the expected result against those facts.

**Does not prove:** A live Square API checkout was executed through G9, that G9 has been deployed to Production, or that the Production account actually received badges. No new Square payment was initiated. No badge was written to Production. This is a fact-mirror integration validation, not a Production end-to-end payment event.

## Production activation consideration

**G9 purchase triggers are not retroactive.** Installing the foundation later will not automatically process already-stored eligible purchases. For owner-expected recognition of the five existing live orders, the Production rollout checklist must include a **separately authorized, controlled initial reconciliation** following approved G9 activation. Do not run global purchase catch-up or modify Production without explicit owner approval.

## Scope

Nothing modified in Square, Railroad, Production, Main, or live customer accounts. Stages A–C foundation and Testing only. Stage D remains outside current authorization.

*Question everything. Challenge each other.*
