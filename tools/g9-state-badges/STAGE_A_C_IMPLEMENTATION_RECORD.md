# PEPPER JUNCTION — G9 State Badge Engine
## Dev / Isolated Testing Implementation Record — November 6, 2026

**Authorization:** Owner approved Stages A–C only. Customer presentation (Stage D), Main and Production are not authorized.

### Environment
- GitHub: `pepperjunction401-beep/sauce-bar` / `Sauce-Bar-Dev`
- Database: isolated Supabase Testing `slubpfmpjgoupujptayy`
- No changes to Square, Railroad, checkout, product CNS, or any existing badge family.
- No Production/Dev-to-Main merge and no Netlify.

### Files
1. `supabase/migrations/20261106141500_g9_state_badge_isolated_foundation.sql`
   - 50-state registry, nine official Census divisions, existing artwork mapping
   - State-specific queue, purchase-level credits, customer levels, secret records
   - Purchase change listener which **only enqueues**, never awards in upstream transaction
   - Independent worker with per-purchase idempotence, customer serialization and retry/error records
   - Controlled reconciliation of missed/held purchase records. It is **not** scheduled.
2. `supabase/migrations/20261106194000_g9_state_queue_ordering_and_indexes.sql`
   - Order ready queue entries by Square completion timestamp
   - Index State-only foreign keys
3. `tools/g9-state-badges/isolated-rollback-tests.sql`
   - Synthetic tests run in nested exception subtransaction, **all generated purchase/account/award data rolled back**; results returned separately
4. `tools/g9-state-badges/TESTING_ONLY_worker_schedule.sql`
   - **Testing-only** cron worker, not in deployable migrations folder
   - Active in Testing under job name `pj-g9-state-worker-testing` (job 3), each minute, batch size 50

### Critical safeguard
- State enqueue uses an exception boundary in the purchase trigger.
- Accepted purchase commits are never contingent on State award calculation.
- The State worker is transactionally separate from purchase intake.
- Worker exceptions roll back the partial State award subtransaction and persist a failed queue entry with retry timing.
- Unique `pj_state_purchase_credits.purchase_id` prevents duplicate level increases.
- Missed queue writes can be recovered via controlled `pj_state_reconcile_queue(100)` call.
- The reconciliation routine does not change Square purchase records.

### Test outcomes (isolated, rollback-contained)
All passed:
- First qualifying order + repeated events => one State credit
- Second distinct order => Level 2
- Pre-cutoff completion => no award
- Shipping destination populated later => award once
- Verified customer attached later => award once
- Division completion => one secret only after all required states
- Refund record after State award => no automatic State credit reversal
- Forced State evaluator error => purchase retained, no partial award, queued failure then successful retry
- Forced enqueue error => purchase retained, controlled reconciliation and recovery
- 9 eligible synthetic credit events counted once; subsequent verification showed 0 persisted purchases, 0 queue rows, 0 credits, 0 customer levels, 0 secrets.

### Current limitations / before production decision
- Isolated SQL tests passed. **No real Square checkout / end-to-end customer award has been tested.**
- Parallel database-session stress test for simultaneous different purchases is still outstanding; the evaluator serializes per customer using an advisory transaction lock.
- Historical catch-up is **not** automatically scheduled or run; it requires separate owner authorization.
- Customer-facing Badge Depot and post-payment integrations (Stage D) have not been built.
- Testing-only worker cron is active; deployment in any other environment would require a separately approved plan.
- The primary G9 family is private: all new tables have RLS enabled with no anon/authenticated policies, and internal worker functions are not callable by public roles.
- Supabase security advisor reported G9 RLS/no-policy INFO notices, expected for private backend tables. New G9 foreign-key indexes addressed the initial missing-index INFO notices.

### Controls and rollback
**Pause new State processing in isolated Testing:**
```sql
select cron.unschedule('pj-g9-state-worker-testing');
```
This pauses the queue worker but does not remove State history, upstream data, or already-written awards.

**Resume Testing-only worker:** execute the checked-in `TESTING_ONLY_worker_schedule.sql` against isolated Testing only.

**Controlled recovery:** after reviewing a fault, call `select public.pj_state_reconcile_queue(100)` and/or `select public.pj_state_process_queue(50)` using trusted backend administration. Never use as an unapproved blanket Production historical award process.

**Full foundation withdrawal:** requires separately reviewed down-migration. Do not cascade-delete purchases or customer data; don't uninstall silently.

### Handoff status
Stages A–B implemented in Dev/Testing. Stage C synthetic checks passed, with real end-to-end and parallel-session stress tests still open. Stage D not authorized.

Question everything. Challenge each other.
