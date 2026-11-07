# G9 — Test 3: Worker delay, failure, recovery, and Check Again

**Date:** November 7, 2026  
**Environment:** GitHub `Sauce-Bar-Dev` and isolated Supabase Testing (`slubpfmpjgoupujptayy`) only.  
**Result:** PASS for independent real database recovery and real Dev browser presentation checks; **one simultaneous live-authenticated queue-to-browser transition was not completed** due to Auth signup rate limiting.

## Actual isolated Testing G9 database execution — PASS

Rollback-contained SQL: [`tools/g9-state-badges/tests/test3_worker_delay_failure_recovery_rollback.sql`](tests/test3_worker_delay_failure_recovery_rollback.sql).

The script executed real purchase triggers, queue states, `pj_state_process_queue()`, `pj_state_evaluate_purchase()`, and purchase-specific award credit/level persistence using one synthetic verified user and two synthetic accepted purchases. All fixture writes and unrelated trigger side effects were rolled back inside the same SQL statement. Evidence returned:

- `delayed_worker_no_premature_credit = PASS`: a legitimate queued purchase with future due time is not awarded prematurely.
- `simulated_failed_job_backoff_obeyed = PASS`: a **test-injected** `failed` queue row is not processed before `next_attempt_at`. The failure status was injected deliberately; no real worker exception was induced.
- `real_worker_recovers_due_failed_job = PASS`: the **real** existing worker processes a due failed queue, clears `last_error`, records `done/credited` with exactly one RI Level 1 credit.
- `real_worker_holds_missing_destination = PASS`: a second completed/attached purchase without a US destination state is naturally held by the real evaluator; no credit awarded.
- `held_job_recovers_after_trusted_ledger_update = PASS`: trusted Testing purchase destination correction re-enqueues via the existing trigger, then real worker credits RI Level 2.
- `no_replay_or_duplicate_awards = PASS`: replay/worker reprocessing does not increment levels twice or create secret awards.

## Browser: actual Dev post-payment HTML and read adapter — PASS

[GitHub Actions #42348049870](https://github.com/pepperjunction401-beep/sauce-bar/actions/runs/42348049870).

**Server-source 12/12 PASS** and **Chromium 8/8 PASS**. The additional G9 Test 3 browser case uses controlled responses from the existing read-only projection contract rather than live Supabase credentials. It:

1. Shows an existing earned Heat card while G9 is pending.
2. Repeatedly clicks **Check Again** across delayed/failed-but-not-yet-awarded responses and observes no invented State card.
3. Receives a completed G9 award result, shows the verified Rhode Island Level 5 card exactly once, alongside Heat.
4. Hides **Check Again** once complete, and on refresh continues to display only the same two cards (no duplicate).

No browser-side evaluator, writer, Square path, or alternative award machinery was introduced.

## Live-login limitation, explicitly recorded

One supervised workflow attempted to create a disposable Supabase Testing Auth account for an **in-one-session** real queue transition; Supabase rejected signup with `email rate limit exceeded` before any account/purchase was created. A subsequent credential-creation SQL alternative was blocked by tool safety checks and **not pursued**. The live-auth workflow was returned to manual-only with an explicit operator acknowledgment gate.

Therefore **do not claim** that one continuous browser session witnessed a real worker failure/recovery in Testing. Test 1 already validated the fully authenticated Testing purchase-ledger → real G9 worker → deployed Edge → real post-payment page and Depot with a successful award, while this Test 3 validates failure/recovery on the real engine and delayed/retry rendering on the real Dev page as complementary independent tests.

## Cleanup/status

After rollback tests, isolated Testing was verified to contain the original 2 Auth users and 2 profiles, with zero G9 Test 3 accounts, zero purchases, zero G9 queue/credits/levels/secrets and zero Passenger queues. No Production resources were read or written for the synthetic Tests 3 fixture; no Main branch, Square, Railroad, importer, database schema, G9 award rules, or deployed Edge Function code changed.

## Recommendation

Treat Test 3's separate-layer failure/recovery and presentation behaviors as **verified**. The joint live-authenticated delayed-to-ready scenario is a remaining **optional strict E2E confirmation** if a fresh Testing Auth user later becomes available through normal approved flows; it is **not** a reason to alter authentication architecture or create another award system.

**Next: Test 4 of 7**, cross-family regressions and responsive checkout/Depot display. Avoid repeating the completed G9 tests.
