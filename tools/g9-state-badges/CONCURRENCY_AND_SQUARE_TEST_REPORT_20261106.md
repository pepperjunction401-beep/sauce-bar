# PEPPER JUNCTION — G9 Stage C Verification
## Concurrency stress + Square end-to-end isolation review
**Date:** November 6, 2026  
**Scope:** Sauce-Bar-Dev and isolated Supabase Testing `slubpfmpjgoupujptayy` only.

### 1. Concurrent award processing — PASS

**Method:** Synthetic accepted purchase records were inserted into the isolated Testing database using an existing Testing-only account without Square customer links or prior purchases. The normal G9 Testing cron was paused during execution. Transactions were deliberately synthetic, not Square-confirmed payments; this is an evaluator stress test, not a Square checkout test.

- Twelve synthetic Rhode Island purchases were first evaluated successfully: twelve unique purchase credits, levels 1–12.
- An initial twelve-call client test returned one successful credit per call, but database times showed calls executed sequentially. That result was **not** counted as a concurrent stress test.
- Four additional synthetic RI purchases were queued.
- Four **independent pg_cron database jobs** invoked `pj_state_process_queue(1)` concurrently, each retaining its transaction locks for two seconds after evaluation.
- Each job began at `2026-11-06 19:49:00 UTC`, start times within about 9 milliseconds:
  - Job 3: 2.024 seconds
  - Job 1: 4.028 seconds
  - Job 2: 6.032 seconds
  - Job 4: 8.034 seconds
- This confirms real overlapping database sessions serialized on the per-customer transaction lock, not just sequential tool requests.
- Every job succeeded. Four separate purchase credits were recorded once, assigned RI levels **13, 14, 15, 16** in original completion order.
- Total stress fixture: **16 purchases / 16 unique credits / final RI level 16**. No duplicate increment or processing failure was observed.

**Important limitation:** This confirms overlapping worker execution and consistency for this tested workload; it is not a proof against every possible concurrency schedule or a real-payment test.

### 2. Square-to-State real-payment end-to-end — BLOCKED BY ISOLATION

Read-only inspection of the deployed isolated Testing function `square-current-transaction-ingest` (v4) found:
- `SQUARE_BASE_URL = "https://connect.squareup.com"` — Square **Production**, not Sandbox.
- It reads `SQUARE_PRODUCTION_ACCESS_TOKEN` and `SQUARE_PEPPER_JUNCTION_LOCATION_ID`.
- The existing Testing database remains isolated, but this deployed function would still call Square's production API if configured and invoked.

**Therefore no Square payment or checkout was initiated.** A genuine end-to-end payment verification requires an explicitly isolated Square Sandbox route with sandbox credentials, sandbox order/payment, and resulting Testing purchase record. The current G9 authorization does not permit replacing or redirecting the existing Production intake or making live Production transactions.

### 3. Cleanup and operational restoration — VERIFIED

- Unschedule all four temporary overlap jobs.
- Delete all 16 synthetic purchases and State evaluation/credit/level records.
- Remove transient Passenger reconciliation queue row created in Testing by existing account/purchase triggers.
- Restore the Testing account's original `verified_unmatched` status.
- Restore `pj-g9-state-worker-testing` (active; one scheduled worker).
- Final read-only counts: **0 purchases; 0 G9 queue rows; 0 credits; 0 levels; 0 secrets; 0 Passenger queue rows; 0 temporary overlap jobs**.
- No Square, live customer, Main, or Production changes occurred.

### 4. Sign-off status

| Check | Result |
| --- | --- |
| Distinct purchases advance state levels | PASS |
| True concurrent worker sessions serialize safely | PASS |
| Four overlapping events yield four unique credits | PASS |
| Chronological levels in tested workload | PASS |
| Synthetic fixture cleanup | PASS |
| Testing-only worker restored | PASS |
| Genuine Square-confirmed payment through fully isolated Sandbox | **NOT RUN / BLOCKED** |

**Boundary:** Stage D and all Main/Production work remain unapproved. No new Square integration was created or changed as part of this verification.

*Question everything. Challenge each other.*
