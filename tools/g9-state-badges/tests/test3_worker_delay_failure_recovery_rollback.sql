-- G9 Test 3. Real Testing purchase triggers, queue, worker and held/retry
-- behavior with EVERY synthetic record rolled back. No production changes.
-- A failed queue status is intentionally injected as a test fixture; it is
-- NOT presented as an observed real worker exception. A natural worker-held
-- path for a missing US state is also exercised separately.
create temp table pg_temp.g9_t3_log(result jsonb) on commit drop;
do $g9_test3$
declare
 v_owner uuid:=gen_random_uuid();
 v_delayed uuid:=gen_random_uuid();
 v_held uuid:=gen_random_uuid();
 v_batch jsonb;
 v_result jsonb:='{}'::jsonb;
 v_prior integer;
begin
 begin
  if (select count(*) from public.purchases)<>0 then
    raise exception 'Isolated Testing purchase baseline nonzero: stop';
  end if;
  insert into auth.users
  (id,instance_id,aud,role,email,email_confirmed_at,created_at,updated_at,raw_app_meta_data)
  values(v_owner,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
     'g9-t3-rollback-'||v_owner::text||'@pepperjunction401.com',
     now(),now(),now(),'{"provider":"email","providers":["email"]}'::jsonb);
  update public.customer_profiles set account_state='verified_matched' where id=v_owner;
  if not found then raise exception 'No synthetic profile created';end if;

  -- A) Accepted US purchase. Real trigger enqueues but operator forces
  -- a future next_attempt_at to represent delayed processing.
  insert into public.purchases
  (id,customer_id,square_order_id,purchase_status,import_status,award_status,
   source_channel,total_amount,currency_code,completed_at,destination_region,destination_country_code)
  values (v_delayed,v_owner,'G9_T3_DELAY_'||replace(v_owner::text,'-',''),
       'completed','attached','blocked','history_import',0,'USD',
       timestamptz '2026-11-07 16:00:00+00','RI','US');
  update public.pj_state_evaluation_queue
    set next_attempt_at=now()+interval '1 hour',updated_at=now()
    where purchase_id=v_delayed and status='pending';
  if not found then raise exception 'Real purchase enqueue missing';end if;
  v_batch:=public.pj_state_process_queue(1);
  if v_batch->>'handled'<>'0'
     or exists(select 1 from public.pj_state_purchase_credits where purchase_id=v_delayed)
  then raise exception 'Premature State processing during delay: %',v_batch;end if;
  v_result:=v_result||jsonb_build_object('delayed_worker_no_premature_credit','PASS');

  -- Simulate a failed queued job *without* forcing an exception or changing
  -- established evaluator logic. Test retry scheduler honors next_attempt_at.
  update public.pj_state_evaluation_queue
    set status='failed',attempts=1,result='evaluation_failed',
        last_error='synthetic-test3-queued-error',
        next_attempt_at=now()+interval '1 hour',updated_at=now()
    where purchase_id=v_delayed and status='pending';
  if not found then raise exception 'Delayed queue status missing';end if;
  v_batch:=public.pj_state_process_queue(1);
  if v_batch->>'handled'<>'0'
     or exists(select 1 from public.pj_state_purchase_credits where purchase_id=v_delayed)
  then raise exception 'Future failed queue should not process: %',v_batch;end if;
  v_result:=v_result||jsonb_build_object('simulated_failed_job_backoff_obeyed','PASS');

  -- Real worker automatically processes due failed jobs, clears errors, and
  -- records only one authoritative purchase-specific awarded_level.
  update public.pj_state_evaluation_queue
    set next_attempt_at=now()-interval '1 second' where purchase_id=v_delayed;
  v_batch:=public.pj_state_process_queue(1);
  if v_batch->>'handled'<>'1' or v_batch->>'credited'<>'1'
     or (select status from public.pj_state_evaluation_queue where purchase_id=v_delayed)<>'done'
     or (select result from public.pj_state_evaluation_queue where purchase_id=v_delayed)<>'credited'
     or (select attempts from public.pj_state_evaluation_queue where purchase_id=v_delayed)<>2
     or (select last_error from public.pj_state_evaluation_queue where purchase_id=v_delayed) is not null
     or (select awarded_level from public.pj_state_purchase_credits where purchase_id=v_delayed)<>1
  then raise exception 'Real worker did not recover simulated failed job: %',v_batch;end if;
  v_result:=v_result||jsonb_build_object('real_worker_recovers_due_failed_job','PASS');

  -- B) Natural held worker state due to missing trusted destination.
  insert into public.purchases
  (id,customer_id,square_order_id,purchase_status,import_status,award_status,
   source_channel,total_amount,currency_code,completed_at,destination_region,destination_country_code)
  values (v_held,v_owner,'G9_T3_HELD_'||replace(v_owner::text,'-',''),
       'completed','attached','blocked','history_import',0,'USD',
       timestamptz '2026-11-07 17:00:00+00',null,'US');
  v_batch:=public.pj_state_process_queue(1);
  if v_batch->>'held'<>'1'
     or (select status from public.pj_state_evaluation_queue where purchase_id=v_held)<>'held'
     or (select result from public.pj_state_evaluation_queue where purchase_id=v_held)<>'held_no_us_destination'
     or exists(select 1 from public.pj_state_purchase_credits where purchase_id=v_held)
  then raise exception 'Missing-destination job was not truly held: %',v_batch;end if;
  v_result:=v_result||jsonb_build_object('real_worker_holds_missing_destination','PASS');

  -- A trusted ledger correction (not the browser) requeues via existing
  -- trigger, then G9's normal worker awards exactly the next RI level.
  update public.purchases set destination_region='RI' where id=v_held;
  if (select status from public.pj_state_evaluation_queue where purchase_id=v_held)<>'pending'
  then raise exception 'Purchase correction failed to reenqueue held G9 job';end if;
  v_batch:=public.pj_state_process_queue(1);
  if v_batch->>'credited'<>'1'
     or (select awarded_level from public.pj_state_purchase_credits where purchase_id=v_held)<>2
     or (select level from public.pj_state_customer_levels where customer_id=v_owner and state_code='RI')<>2
  then raise exception 'Held job did not recover as exact second RI credit: %',v_batch;end if;
  v_result:=v_result||jsonb_build_object('held_job_recovers_after_trusted_ledger_update','PASS');

  -- Final idempotence: no replay, no double increment, no secret award.
  v_batch:=public.pj_state_process_queue(10);
  if v_batch->>'handled'<>'0'
     or public.pj_state_evaluate_purchase(v_delayed)<>'already_credited'
     or public.pj_state_evaluate_purchase(v_held)<>'already_credited'
     or (select count(*) from public.pj_state_purchase_credits where customer_id=v_owner)<>2
     or (select level from public.pj_state_customer_levels where customer_id=v_owner and state_code='RI')<>2
     or exists(select 1 from public.pj_state_secret_awards where customer_id=v_owner)
  then raise exception 'Duplicate credit or unexpected secret after recovery';end if;
  v_result:=v_result||jsonb_build_object('no_replay_or_duplicate_awards','PASS',
    'tested_synthetic_purchases',2,'temporary_accounts',1);

  raise exception 'ROLL BACK ALL G9 TEST3' using errcode='PZ001';
 exception
  when sqlstate 'PZ001' then
   insert into pg_temp.g9_t3_log values(v_result||jsonb_build_object('outcome','PASS','all_fixtures_rolled_back',true));
  when others then
   insert into pg_temp.g9_t3_log values(v_result||jsonb_build_object('outcome','FAIL','error',sqlstate||': '||sqlerrm,'all_fixtures_rolled_back',true));
 end;
end $g9_test3$;
select result from pg_temp.g9_t3_log;