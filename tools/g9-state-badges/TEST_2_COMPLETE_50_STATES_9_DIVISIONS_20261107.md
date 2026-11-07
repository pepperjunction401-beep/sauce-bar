# G9 — Test 2: All 50 States and Nine Division Secrets

**Test outcome:** PASS — isolated Testing database and Dev Chromium display.
**Date:** November 7, 2026.
**Approved scope:** GitHub `Sauce-Bar-Dev`, isolated Supabase Testing `slubpfmpjgoupujptayy` only.
**Never changed:** Main, Production, Square, Railroad, importer, deployed Edge Function, badge engine code.

## Actual database engine: PASS

Test script: [`tools/g9-state-badges/tests/test2_50_states_nine_divisions_rollback.sql`](../tests/test2_50_states_nine_divisions_rollback.sql).

The script uses the **real** Testing purchase triggers, G9 queue, `pj_state_process_queue()`, credits, customer levels, division-secret awards, and authenticated collection projection. A nested PL/pgSQL exception intentionally aborts all synthetic inserts and award changes before returning a separate test-result record.

- **50/50** state registrations and exact Census division membership, independently compared to the explicit official state-code manifest; DC excluded; Arkansas and Louisiana correctly in West South Central; existing Tennessee filename spelling preserved.
- **9/9** Census divisions have the correct required state counts.
- **41/41** initial distinct state purchases credited while each division lacked its final state; **zero prematurely earned division secrets**.
- **9/9** final distinct State purchases credited; **9/9** division-completion secrets earned, each attributed via `source_purchase_id` to its own division's qualifying last State purchase.
- **50/50** states earned at Level 1, one credit per unique purchase.
- Rhode Island credited from **Level 1 through Level 12** with 11 separate later completed/attached purchase records, and **every credit stored its own actual awarded level**, not the later collection total.
- Duplicate/replayed purchase evaluation returned `already_credited`, with no duplicate State increments or secret awards.
- Second isolated verified customer earned only Arkansas Level 1; projection exposed no other customer's 50 badges or nine secrets.
- Verified owner's `pj_state_my_collection()` returned exactly 50 State levels, 9 earned divisions; second customer received 1 State and 0 secrets.
- **62 total unique G9 State purchase credits** exercised by the nested rollback test.
- **Zero persistent test changes.**

## Browser UI: PASS, 7 of 7 cases

[GitHub Actions Chromium run #42347147624](https://github.com/pepperjunction401-beep/sauce-bar/actions/runs/42347147624).

The actual `passenger-station.html` Dev page and existing Depot adapter were loaded in headless Chromium. Supabase responses were **synthetic and controlled**, not a real authenticated Testing login in this Test 2 browser run. Test 1 independently established the genuine authenticated end-to-end Testing login and purchase-backed RI Level 1 case.

1. Earned Rhode Island Level 5; unearned State remains locked and cannot flip.
2. An earned division secret is displayed; unearned divisions are not exposed.
3. Unverified account: all 50 States locked; no secret disclosures.
4. Reader outage: all 50 States locked; Depot still accessible.
5. **All 50** distinct State cards show earned status, mapped name, correct artwork reference and level; Rhode Island displays Level 12; **all 9** earned division secrets display.
6. Only Rhode Island earned: other 49 locked and **no** unearned division-secret metadata shown.
7. Signed-out visit redirects to first-party sign-in.

The browser blocks external HTTP requests (including absolute image URLs to the official Production domain) to prevent accessing Production. **This does not prove image pixels loaded in Chromium.** Instead, a separate read-only GitHub repository-tree comparison confirmed **all 50/50** registered artwork paths exist as distinct PNG files in `Sauce-Bar-Dev`, including Arkansas, Louisiana, and `badges-states-tennesee.png`.

## Isolation and cleanup

After the rollback-containing SQL tests:

| Test data | Persisting count |
|---|---:|
| Auth users | 2 (original baseline) |
| Customer profiles | 2 (original baseline) |
| Purchases | 0 |
| G9 evaluation queue | 0 |
| G9 purchase credits | 0 |
| G9 customer levels | 0 |
| G9 division secret awards | 0 |
| Passenger reconciliation queue | 0 |
| G9 Test 2 disposable users | 0 |

No Dev application changes were necessary. Only test harness and test record files were created or updated on Dev.

## Scope and next step

**Test 2 complete** as the isolated 50-State, nine-division, level, attribution, privacy, and display regression. This is not a claim of paid Square transaction or complete browser network/artwork acceptance.

**Next: Test 3 of 7** — real queue-delay/failure/retry recovery while the post-payment page is open, including safe manual **Check Again**, no repeated awards, and no browser invocation of the award evaluator.

The nine division-secret illustration assets remain outstanding; the earned-only fallback presentation works, and no unearned secret imagery or progress is exposed.

**No authorization or action to Main or Production.**
