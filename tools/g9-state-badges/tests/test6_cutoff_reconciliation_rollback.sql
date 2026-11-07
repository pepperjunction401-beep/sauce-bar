-- G9 Test 6 — October 8 RI-midnight cutoff, queue gap recovery,
-- strict purchase eligibility, historical reconciliation & idempotence.
-- ONLY isolated Supabase Testing. No Supabase Production, Square, or Main.
-- All synthetic Auth, Profiles, Purchases, Queue, awards and trigger effects
-- rolled back with a deliberate exception within a nested PL/pgSQL block.
create temp table pg_temp.g9_t6_log(results jsonb) on commit drop;
do $test6$
declare
  v_owner uuid:=gen_random_uuid();
  v_guest uuid:=gen_random_uuid();
  v_prefix text;
  v_pre uuid:=gen_random_uuid();
  v_boundary uuid:=gen_random_uuid();
  v_ct uuid:=gen_random_uuid();
  v_ny uuid:=gen_random_uuid();
  v_foreign uuid:=gen_random_uuid();
  v_unknown uuid:=gen_random_uuid();
  v_missing uuid:=gen_random_uuid();
  v_refunded uuid:=gen_random_uuid();
  v_imported uuid:=gen_random_uuid();
  v_guest_purchase uuid:=gen_random_uuid();
  v_no_completion uuid:=gen_random_uuid();
  v_late uuid:=gen_random_uuid();
  v_n integer;
  v_batch jsonb;
  v_rows jsonb:='{}'::jsonb;
  v_duplicate_blocked boolean:=false;
begin
 begin
  if (select count(*) from public.purchases)<>0 then
    raise exception 'Isolated Testing purchase ledger is not empty; refuse fixture';
  end if;
  insert into auth.users
    (id,instance_id,aud,role,email,email_confirmed_at,created_at,updated_at,raw_app_meta_data)
  select id,'00000000-0000-0000-0000-000000000000'::uuid,'authenticated','authenticated',
    'g9-test6-rollback-'||id::text||'@pepperjunction401.com',now(),now(),now(),
    '{"provider":"email","providers":["email"]}'::jsonb
  from (values(v_owner),(v_guest)) x(id);
  update public.customer_profiles set account_state='verified_matched' where id=v_owner;
  if not found then raise exception 'Owner verified-match fixture missing';end if;
  if (select account_state from public.customer_profiles where id=v_guest)='verified_matched'
    then raise exception 'Guest accidentally verified_matched';end if;
  v_prefix:='G9_T6_'||replace(v_owner::text,'-','')||'_';

  -- The real purchase trigger enqueues ALL eleven initial fixtures. To
  -- rehearse reconciliation after a missing queue, remove the synthetic
  -- queue entries inside this rollback-only transaction before reconciling.
  insert into public.purchases
    (id,customer_id,square_order_id,purchase_status,import_status,award_status,
     source_channel,total_amount,currency_code,completed_at,destination_region,destination_country_code)
  select id,customer_id,v_prefix||name,purchase_status,import_status,'blocked',
     'history_import',0,'USD',completed_at,destination_region,destination_country_code
  from (values
   (v_pre,v_owner,'PRE','completed','attached','2026-10-08 03:59:59+00'::timestamptz,'RI','US'),
   (v_boundary,v_owner,'MIDNIGHT','completed','attached','2026-10-08 04:00:00+00'::timestamptz,'RI','US'),
   (v_ct,v_owner,'CT','completed','attached','2026-10-10 17:00:00+00'::timestamptz,'Connecticut','US'),
   (v_ny,v_owner,'NY','completed','attached','2026-10-11 17:00:00+00'::timestamptz,'NY','US'),
   (v_foreign,v_owner,'FOREIGN','completed','attached','2026-10-12 17:00:00+00'::timestamptz,'ON','CA'),
   (v_unknown,v_owner,'UNKNOWN','completed','attached','2026-10-12 17:01:00+00'::timestamptz,'XX','US'),
   (v_missing,v_owner,'MISSING','completed','attached','2026-10-12 17:02:00+00'::timestamptz,null,'US'),
   (v_refunded,v_owner,'REFUNDED','refunded','attached','2026-10-12 17:03:00+00'::timestamptz,'RI','US'),
   (v_imported,v_owner,'UNATTACHED','completed','imported','2026-10-12 17:04:00+00'::timestamptz,'RI','US'),
   (v_guest_purchase,v_guest,'UNVERIFIED','completed','attached','2026-10-12 17:05:00+00'::timestamptz,'RI','US'),
   (v_no_completion,v_owner,'NO_TIME','completed','attached',null::timestamptz,'RI','US')
  ) as t(id,customer_id,name,purchase_status,import_status,completed_at,destination_region,destination_country_code);
  if (select count(*) from public.purchases where customer_id in(v_owner,v_guest))<>11
     or (select count(*) from public.pj_state_evaluation_queue q
          join public.purchases p on p.id=q.purchase_id where p.customer_id in(v_owner,v_guest))<>11
  then raise exception 'Expected 11 trigger-enqueued initial fixtures';end if;
  v_rows:=v_rows||jsonb_build_object('initial_purchase_trigger_11_queues','PASS');

  -- One second before 2026-10-08 America/New_York local midnight is excluded.
  if (v_pre is null or (timestamptz '2026-10-08 03:59:59+00' at time zone 'America/New_York')::date<>date '2026-10-07'
      or (timestamptz '2026-10-08 04:00:00+00' at time zone 'America/New_York')::date<>date '2026-10-08'
      or public.pj_state_evaluate_purchase(v_pre)<>'excluded_pre_cutoff'
      or exists(select 1 from public.pj_state_purchase_credits where purchase_id=v_pre))
  then raise exception 'G9 2026-10-08 Rhode Island midnight boundary failed';end if;
  v_rows:=v_rows||jsonb_build_object('oct8_RI_local_midnight_cutoff','PASS');

  if public.pj_state_evaluate_purchase(v_refunded)<>'held_not_eligible'
      or public.pj_state_evaluate_purchase(v_imported)<>'held_not_eligible'
      or public.pj_state_evaluate_purchase(v_guest_purchase)<>'held_not_eligible'
      or public.pj_state_evaluate_purchase(v_no_completion)<>'held_not_eligible'
      or public.pj_state_evaluate_purchase(v_foreign)<>'held_no_us_destination'
      or public.pj_state_evaluate_purchase(v_missing)<>'held_no_us_destination'
      or public.pj_state_evaluate_purchase(v_unknown)<>'held_unknown_state'
  then raise exception 'G9 eligibility gate allowed a disallowed purchase';end if;
  v_rows:=v_rows||jsonb_build_object('refunded_unattached_unverified_nulltime_nonUS_unknown_held','PASS');

  -- Initial live ingest queues have been deliberately "lost" in this fixture
  -- (not in real data), simulating a deployment/backfill reconciliation gap.
  delete from public.pj_state_evaluation_queue where purchase_id in
    (select id from public.purchases where customer_id in(v_owner,v_guest));
  if exists(select 1 from public.pj_state_evaluation_queue where purchase_id in
    (select id from public.purchases where customer_id in(v_owner,v_guest)))
  then raise exception 'Synthetic gap rehearsal queue not cleared';end if;
  v_n:=public.pj_state_reconcile_queue(100);
  if v_n<>3 then raise exception 'Reconcile should enqueue exactly 3 eligible: returned %',v_n;end if;
  if (select count(*) from public.pj_state_evaluation_queue)<>3
      or exists(select 1 from public.pj_state_evaluation_queue
        where purchase_id in(v_pre,v_foreign,v_unknown,v_missing,v_refunded,v_imported,v_guest_purchase,v_no_completion))
  then raise exception 'Reconciliation pulled in rejected pre-cutoff/untrusted purchase';end if;
  v_rows:=v_rows||jsonb_build_object('gap_reconciliation_3_of_11_only','PASS');

  v_n:=public.pj_state_reconcile_queue(100);
  if v_n<>0 then raise exception 'Repeated reconciliation duplicated pending jobs: %',v_n;end if;
  v_batch:=public.pj_state_process_queue(2);
  if v_batch->>'handled'<>'2' or v_batch->>'credited'<>'2'
      or (select state_code from public.pj_state_purchase_credits where purchase_id=v_boundary)<>'RI'
      or (select state_code from public.pj_state_purchase_credits where purchase_id=v_ct)<>'CT'
      or (select awarded_level from public.pj_state_purchase_credits where purchase_id=v_boundary)<>1
  then raise exception 'Batch of two not ordered/credited by original Square completed_at: %',v_batch;end if;
  v_batch:=public.pj_state_process_queue(50);
  if v_batch->>'handled'<>'1' or v_batch->>'credited'<>'1'
      or (select state_code from public.pj_state_purchase_credits where purchase_id=v_ny)<>'NY'
  then raise exception 'Remaining eligible queue batch failed: %',v_batch;end if;
  if public.pj_state_reconcile_queue(100)<>0
      or (public.pj_state_process_queue(50)->>'handled')::integer<>0
      or (select count(*) from public.pj_state_purchase_credits where customer_id=v_owner)<>3
  then raise exception 'Reconciliation or worker replay generated duplicate credit';end if;
  v_rows:=v_rows||jsonb_build_object('reconciliation_idempotent_3_credits_2_batches','PASS');

  -- Square Order ID must remain unique at source-ledger level.
  begin
   insert into public.purchases
     (id,customer_id,square_order_id,purchase_status,import_status,award_status,source_channel,total_amount,currency_code,completed_at,destination_region,destination_country_code)
   values(gen_random_uuid(),v_owner,v_prefix||'MIDNIGHT','completed','attached','blocked','history_import',0,'USD',
     '2026-10-08 04:00:00+00','RI','US');
  exception when unique_violation then v_duplicate_blocked:=true;
  end;
  if not v_duplicate_blocked then raise exception 'Duplicate Square order ID inserted';end if;
  v_rows:=v_rows||jsonb_build_object('square_order_id_unique_dedupe','PASS');

  -- Arriving later as historical import: after-cutoff 2026-10-09 completion,
  -- but discovered only after the first 3 credits. Reconcile can recover it;
  -- do not claim the batch is a real Square-importer test.
  insert into public.purchases
    (id,customer_id,square_order_id,purchase_status,import_status,award_status,
     source_channel,total_amount,currency_code,completed_at,destination_region,destination_country_code)
  values(v_late,v_owner,v_prefix||'LATE_IMPORT','completed','attached','blocked','history_import',0,'USD',
     '2026-10-09 12:00:00+00','NY','US');
  delete from public.pj_state_evaluation_queue where purchase_id=v_late;
  if public.pj_state_reconcile_queue(100)<>1 then
      raise exception 'Late eligible purchase not recovered by reconciliation';end if;
  v_batch:=public.pj_state_process_queue(50);
  if v_batch->>'credited'<>'1'
      or (select count(*) from public.pj_state_purchase_credits where purchase_id=v_late)<>1
      or (select level from public.pj_state_customer_levels where customer_id=v_owner and state_code='NY')<>2
      or (select awarded_level from public.pj_state_purchase_credits where purchase_id=v_ny)<>1
      or (select awarded_level from public.pj_state_purchase_credits where purchase_id=v_late)<>2
  then raise exception 'Late after-cutoff historical purchase not credited exactly once: %',v_batch;end if;
  if public.pj_state_reconcile_queue(100)<>0
      or (public.pj_state_process_queue(50)->>'handled')::integer<>0
  then raise exception 'Late reconciliation replayed completed order';end if;
  v_rows:=v_rows||jsonb_build_object('late_historical_eligible_purchase_recovered_once','PASS');

  -- Delayed trusted correction, not a frontend award: bad State is held and
  -- excluded from reconciliation, then source-ledger corrected and queued.
  update public.purchases set destination_region='MA' where id=v_unknown;
  if not exists (select 1 from public.pj_state_evaluation_queue where purchase_id=v_unknown and status='pending')
  then raise exception 'Trusted state correction did not enqueue G9';end if;
  v_batch:=public.pj_state_process_queue(50);
  if v_batch->>'credited'<>'1' or
     (select state_code from public.pj_state_purchase_credits where purchase_id=v_unknown)<>'MA'
  then raise exception 'Trusted correction recovery was not awarded once: %',v_batch;end if;
  v_rows:=v_rows||jsonb_build_object('trusted_ledger_destination_correction_requeues','PASS');

  -- Recap: 3 original + 1 late + 1 corrected = five eligible State credits;
  -- none from the pre-Oct-8, foreign, invalid, refunded, unmatched, or
  -- unattached/unknown-completion rejected purchase variants.
  if (select count(*) from public.pj_state_purchase_credits where customer_id=v_owner)<>5
    or exists(select 1 from public.pj_state_purchase_credits where purchase_id in
     (v_pre,v_foreign,v_missing,v_refunded,v_imported,v_guest_purchase,v_no_completion))
  then raise exception 'Rehearsal credit set has unexpected denied purchase';end if;
  v_rows:=v_rows||jsonb_build_object('final_only_5_authorized_credits','PASS',
    'rehearsal_initial_purchases',11,'rehearsal_late_purchases',1,
    'expected_awards',5,'all_synthetic_rows_rolled_back',true);
  raise exception 'G9_T6_INTENTIONAL_ROLLBACK' using errcode='PZ001';
 exception
  when sqlstate 'PZ001' then
    insert into pg_temp.g9_t6_log values(v_rows||jsonb_build_object('outcome','PASS'));
  when others then
    insert into pg_temp.g9_t6_log values(v_rows||jsonb_build_object('outcome','FAIL',
       'error',sqlstate||': '||sqlerrm,'all_synthetic_rows_rolled_back',true));
 end;
end $test6$;
select results from pg_temp.g9_t6_log;