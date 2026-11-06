-- G9 isolated Supabase Testing ONLY. Do not deploy this file to Main/Production.
-- Controlled Stage C queue runner; never scans prior purchases.
-- Schedule is intentionally outside supabase/migrations/ to prevent accidental
-- production scheduling on Dev->Main merges.
select cron.schedule(
  'pj-g9-state-worker-testing',
  '* * * * *',
  $job$select public.pj_state_process_queue(50);$job$
);

-- Verification:
-- select jobid,jobname,schedule,active from cron.job
-- where jobname='pj-g9-state-worker-testing';
--
-- Shutdown:
-- select cron.unschedule('pj-g9-state-worker-testing');
--
-- Reconciliation is intentionally NOT scheduled and remains an explicit
-- owner-approved operator action: select public.pj_state_reconcile_queue(100);
