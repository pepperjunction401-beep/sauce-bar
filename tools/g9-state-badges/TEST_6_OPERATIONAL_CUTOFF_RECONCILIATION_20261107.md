# G9 — Test 6: Operational worker, October 8 cutoff and reconciliation rehearsal

**Date:** November 7, 2026  
**Environment:** Sauce-Bar-Dev + isolated Supabase Testing `slubpfmpjgoupujptayy`  
**Outcome:** PASS at Testing scope. **Production scheduling, data inventory and go-live actions require separate owner approval.**

## 1. Scheduled worker observed — PASS

Read-only inspection of `cron.job` and `cron.job_run_details` in Supabase Testing found the existing scheduled job `pj-g9-state-worker-testing` (job ID 8) **active**, with cron schedule `* * * * *` (every minute) and command `select public.pj_state_process_queue(50);`.

- Initial read: **674 recorded runs, 674 succeeded, 0 failed**, from 2026-11-06 19:51 UTC to 2026-11-07 07:04 UTC. Maximum observed duration approximately 82 ms.
- Later read: **60/60 successful jobs in the last hour**, zero failures, latest at 2026-11-07 14:58 UTC, max duration approximately 25 ms.
- These execution records prove the **scheduler invokes the database function successfully**, not that real customer purchases or a Production G9 worker were validated.
- Dedicated due-queue index `pj_state_queue_due_idx` exists; default worker batch limit is 50 (supported 1–500), takes due pending/failed jobs and locks rows using `FOR UPDATE SKIP LOCKED`. Completed jobs are not retried.

## 2. October 8 and reconciliation rehearse — PASS

Rollback-only test SQL: `tools/g9-state-badges/tests/test6_cutoff_reconciliation_rollback.sql`.

The test ran actual Supabase Testing purchase insert triggers, `pj_state_evaluate_purchase()`, `pj_state_reconcile_queue()`, `pj_state_process_queue()`, constraints and credits inside a nested, deliberately rolled-back transaction.

- **11 initial** synthetic purchases caused **11** purchase-trigger queue entries.
- Explicit Rhode Island cutoff: 2026-10-08 03:59:59 UTC = October 7, 11:59:59 p.m. local and `excluded_pre_cutoff`; 2026-10-08 04:00:00 UTC = October 8, midnight local and **eligible**.
- Refunded status, imported/unattached, unverified customer, missing completed timestamp, foreign shipping destination, absent state and unknown U.S. state were held/excluded; **no State credits** awarded.
- All 11 synthetic queue rows were deliberately deleted **inside the rollback-only test subtransaction** to simulate a missing-queue/initial-backfill gap. **No persistent real queues were deleted.**
- The existing `pj_state_reconcile_queue(100)` selected exactly **three** initially eligible purchases, not eight ineligible cases.
- A second reconciliation selected **zero** duplicates. Two worker calls (batches of two and remaining one) credited exactly three; repeated reconciliation and worker passes stayed idle.
- A second synthetic insert with the same Square Order ID was blocked by the existing unique ledger constraint.
- A **late-arriving** eligible October 9 purchase recovered into the queue and credited exactly once via the normal worker. Its New York State level increased to 2, and the existing NY purchase retained Level 1.
- A previously unrecognized US state was corrected in the **trusted Testing purchase row**, which automatically reenqueued via the established trigger, and was then credited exactly once as Massachusetts.
- Total **12** simulated purchases (11 initial + 1 late); **five** credits after the trusted correction. No pre-launch or otherwise disallowed credit.
- **Every synthetic Auth, customer, purchase, queue and award row rolled back** after the test returned PASS.

## 3. Recovery and separation of responsibilities

Operational flow remains the approved architecture:

`Square paid/accepted` → `existing trusted importer/Railroad and verified identity` → `completed+attached purchases` → `G9 enqueue` → `scheduled G9 worker` → `authoritative State credits/levels and earned-only division secrets` → `read-only Depot and post-payment`.

The **worker** is scheduled automatically in isolated Testing. `pj_state_reconcile_queue` is **not scheduled** there. This is appropriate for an owner-authorized, limited initial recovery operation; a routine automated reconciliation schedule would be a new operational decision and was **not added**.

The existing reconciliation function selects *already accepted*, post-October-8, completed+attached, verified-matched US purchases with a known state and no credit; its idempotence is proven above. It never imports a Square order or decides payment/identity validity.

Operational notes:
- Held jobs remain held until the trusted ledger evidence is repaired and the existing trigger/reconciliation makes them eligible again. A browser must never force that repair.
- A failed job with future `next_attempt_at` is subject to backoff; scheduled worker recovers it when due.
- Scheduler success must be monitored **separately** from queue health; a successfully invoked worker can still return handled/failed/held counts.
- An initial Production reconciliation and any repeat execution will require explicit owner authorization. It is NOT part of this test.

## 4. Production go-live prerequisites (not executed)

Before a separately authorized Dev → Main release and Production installation:

1. Owner approves exact website merge and matching Supabase Production migrations, worker job and schedule. No Netlify involved.
2. Confirm Production purchase, customer and destination evidence **read-only** using the same canonical classifications; the number of eligible purchases and expected workload is **currently unknown**, since this test deliberately did not access Production.
3. Agree on the desired historical catchup from **October 8, 2026 onward only**, without importing earlier purchase history into State Badges. Confirm customer eligibility, owner-held returns policy, and no unexpected unverified matches.
4. Establish a pre-change backup/recovery point and record schema/function versions. Have rollback plan reviewed: disable the **new G9 Production worker job only** if needed (without stopping unrelated jobs); revert G9 website visibility via normal Dev→Main process with owner permission; do not delete customer-earned awards or purchase history as an automatic rollback.
5. Run a small, controlled, owner-approved Production State reconciliation batch; inspect queue/credit/level/secret counts, retry statuses and error messages before increasing workload. This must never be triggered by a checkout page.
6. Perform the owner-authorized genuine Square paid acceptance test (Test 7), including Depot and checkout-specific post-payment agreement.

**No Production cron, data, migration, reconciliation or customer records have been touched.**

## 5. Cleanup baseline verified

After Test 6, isolated Testing contained its original **two Auth users and two profiles**; **zero** purchase rows, G9 queue, G9 credits, G9 levels, G9 secrets and Passenger reconciliation queue rows.

## Final conclusion

**Test 6 PASSED** at its authorized isolated Testing scope: scheduled worker cadence, eligibility date boundary, missed-queue reconciliation, selective backfill, duplicate prevention, a late historical eligible event and trusted correction all behaved as designed.

**One required release decision remains:** initial Production deployment/reconciliation procedures must be explicitly approved and matched to read-only Production purchase counts. This is a release gate, not a discovered defect.

**Test 7 of 7:** The final real paid Square acceptance can occur **only after** separate authorization for Dev→Main, Production setup and live owner checkout.
