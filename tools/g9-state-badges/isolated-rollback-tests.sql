-- G9 Stage C synthetic verification. Run in isolated Testing only.
-- Everything affecting customer/purchase/award records happens inside an
-- exception subtransaction that is deliberately rolled back.
create temporary table pg_temp.g9_test_report(report jsonb) on commit drop;
do $test$
declare
 v_cust uuid;
 v_a uuid:=gen_random_uuid(); v_b uuid:=gen_random_uuid();
 v_old uuid:=gen_random_uuid(); v_late uuid:=gen_random_uuid(); v_attach uuid:=gen_random_uuid();
 v_nj uuid:=gen_random_uuid(); v_ny uuid:=gen_random_uuid(); v_pa uuid:=gen_random_uuid();
 v_fail uuid:=gen_random_uuid(); v_enqueue uuid:=gen_random_uuid();
 v_r jsonb:='{}'::jsonb;
 v_n integer;
 v_status text;
begin
 begin
  select id into v_cust from public.customer_profiles
   where account_state='verified_unmatched' limit 1;
  if v_cust is null then raise exception 'No isolated test account available'; end if;
  update public.customer_profiles set account_state='verified_matched' where id=v_cust;

  -- One RI order + event replay -> one credit.
  insert into public.purchases(id,customer_id,square_order_id,purchase_status,
    import_status,award_status,source_channel,total_amount,currency_code,completed_at,
    destination_region,destination_country_code)
  values (v_a,v_cust,'g9-synthetic-'||v_a,'completed','attached','blocked',
    'signed_in_checkout',10,'USD','2026-10-08 17:00+00','RI','US');
  perform public.pj_state_process_queue(30);
  perform public.pj_state_process_queue(30);
  select count(*) into v_n from public.pj_state_purchase_credits where purchase_id=v_a;
  if v_n<>1 then raise exception 'first purchase expected one credit; got %',v_n; end if;
  update public.purchases set destination_region='RI' where id=v_a;
  perform public.pj_state_process_queue(30);
  select count(*) into v_n from public.pj_state_purchase_credits where purchase_id=v_a;
  if v_n<>1 then raise exception 'replay duplicate credit'; end if;
  v_r:=v_r||jsonb_build_object('first_award_and_replay','PASS');

  -- Second separate purchase levels RI to 2.
  insert into public.purchases(id,customer_id,square_order_id,purchase_status,
    import_status,award_status,source_channel,total_amount,currency_code,completed_at,
    destination_region,destination_country_code)
  values (v_b,v_cust,'g9-synthetic-'||v_b,'completed','attached','blocked',
    'signed_in_checkout',10,'USD','2026-10-09 17:00+00','RI','US');
  perform public.pj_state_process_queue(30);
  select level into v_n from public.pj_state_customer_levels
   where customer_id=v_cust and state_code='RI';
  if v_n<>2 then raise exception 'second RI order expected L2 got %',v_n; end if;
  v_r:=v_r||jsonb_build_object('repeat_order_level_2','PASS');

  -- Oct 7 local time excluded even though imported now.
  insert into public.purchases(id,customer_id,square_order_id,purchase_status,
    import_status,award_status,source_channel,total_amount,currency_code,completed_at,
    destination_region,destination_country_code)
  values (v_old,v_cust,'g9-synthetic-'||v_old,'completed','attached','blocked',
    'history_import',10,'USD','2026-10-07 21:00+00','CA','US');
  perform public.pj_state_process_queue(30);
  select count(*) into v_n from public.pj_state_purchase_credits where purchase_id=v_old;
  if v_n<>0 then raise exception 'pre-cutoff credited'; end if;
  v_r:=v_r||jsonb_build_object('pre_cutoff_excluded','PASS');

  -- Late destination: held until address arrives.
  insert into public.purchases(id,customer_id,square_order_id,purchase_status,
    import_status,award_status,source_channel,total_amount,currency_code,completed_at,
    destination_region,destination_country_code)
  values (v_late,v_cust,'g9-synthetic-'||v_late,'completed','attached','blocked',
    'history_import',10,'USD','2026-10-10 17:00+00',null,'US');
  perform public.pj_state_process_queue(30);
  select status into v_status from public.pj_state_evaluation_queue where purchase_id=v_late;
  if v_status<>'held' then raise exception 'missing destination should hold, got %',v_status; end if;
  update public.purchases set destination_region='CA' where id=v_late;
  perform public.pj_state_process_queue(30);
  select count(*) into v_n from public.pj_state_purchase_credits where purchase_id=v_late and state_code='CA';
  if v_n<>1 then raise exception 'late destination award missing'; end if;
  v_r:=v_r||jsonb_build_object('late_destination','PASS');

  -- Purchase arriving before the upstream attachment: it must only credit
  -- after Phase 1/2 attach it to the verified PJ customer.
  insert into public.purchases(id,customer_id,square_order_id,purchase_status,
    import_status,award_status,source_channel,total_amount,currency_code,completed_at,
    destination_region,destination_country_code)
  values (v_attach,null,'g9-synthetic-'||v_attach,'completed','imported','blocked',
    'webhook',10,'USD','2026-10-10 19:00+00','CT','US');
  perform public.pj_state_process_queue(30);
  select status into v_status from public.pj_state_evaluation_queue where purchase_id=v_attach;
  if v_status<>'held' then raise exception 'unattached purchase must be held, got %',v_status; end if;
  update public.purchases
    set customer_id=v_cust,import_status='attached' where id=v_attach;
  perform public.pj_state_process_queue(30);
  select count(*) into v_n from public.pj_state_purchase_credits where purchase_id=v_attach and state_code='CT';
  if v_n<>1 then raise exception 'late attachment not credited'; end if;
  v_r:=v_r||jsonb_build_object('late_verified_attachment','PASS');

  -- No automated State Badge deduction when Square records a refund.
  update public.purchases set purchase_status='refunded' where id=v_b;
  perform public.pj_state_process_queue(30);
  select count(*) into v_n from public.pj_state_purchase_credits where purchase_id=v_b;
  if v_n<>1 then raise exception 'refund improperly reversed State credit'; end if;
  v_r:=v_r||jsonb_build_object('owner_only_refund_changes','PASS');

  -- Complete the three-state Middle Atlantic division.
  insert into public.purchases(id,customer_id,square_order_id,purchase_status,
    import_status,award_status,source_channel,total_amount,currency_code,completed_at,
    destination_region,destination_country_code)
  values
  (v_nj,v_cust,'g9-synthetic-'||v_nj,'completed','attached','blocked','history_import',10,'USD','2026-10-11 17:00+00','NJ','US'),
  (v_ny,v_cust,'g9-synthetic-'||v_ny,'completed','attached','blocked','history_import',10,'USD','2026-10-12 17:00+00','NY','US');
  perform public.pj_state_process_queue(30);
  select count(*) into v_n from public.pj_state_secret_awards where customer_id=v_cust and division_code='middle_atlantic';
  if v_n<>0 then raise exception 'secret awarded prematurely'; end if;
  insert into public.purchases(id,customer_id,square_order_id,purchase_status,
    import_status,award_status,source_channel,total_amount,currency_code,completed_at,
    destination_region,destination_country_code)
  values (v_pa,v_cust,'g9-synthetic-'||v_pa,'completed','attached','blocked',
    'history_import',10,'USD','2026-10-13 17:00+00','PA','US');
  perform public.pj_state_process_queue(30);
  select count(*) into v_n from public.pj_state_secret_awards
   where customer_id=v_cust and division_code='middle_atlantic';
  if v_n<>1 then raise exception 'division secret not awarded exactly once'; end if;
  v_r:=v_r||jsonb_build_object('division_secret_completion','PASS');

  -- State evaluator failure: simulated table constraint prohibits RI.
  -- Separate worker transaction must retain purchase and durable retry.
  alter table public.pj_state_customer_levels
     add constraint g9_synthetic_block_wy check(state_code<>'WY');
  insert into public.purchases(id,customer_id,square_order_id,purchase_status,
    import_status,award_status,source_channel,total_amount,currency_code,completed_at,
    destination_region,destination_country_code)
  values (v_fail,v_cust,'g9-synthetic-'||v_fail,'completed','attached','blocked',
    'signed_in_checkout',10,'USD','2026-10-14 17:00+00','WY','US');
  perform public.pj_state_process_queue(30);
  select status into v_status from public.pj_state_evaluation_queue where purchase_id=v_fail;
  if v_status<>'failed' then raise exception 'worker failure not persisted: %',v_status; end if;
  select count(*) into v_n from public.purchases where id=v_fail;
  if v_n<>1 then raise exception 'purchase was lost due to State failure'; end if;
  select count(*) into v_n from public.pj_state_purchase_credits where purchase_id=v_fail;
  if v_n<>0 then raise exception 'partial award persisted after failure'; end if;
  alter table public.pj_state_customer_levels drop constraint g9_synthetic_block_wy;
  update public.pj_state_evaluation_queue set next_attempt_at=now() where purchase_id=v_fail;
  perform public.pj_state_process_queue(30);
  select count(*) into v_n from public.pj_state_purchase_credits where purchase_id=v_fail;
  if v_n<>1 then raise exception 'recovery failed'; end if;
  v_r:=v_r||jsonb_build_object('worker_failure_and_retry','PASS');

  -- Even if the queue INSERT throws, its trigger must not abort the purchase.
  execute format('alter table public.pj_state_evaluation_queue add constraint g9_synthetic_queue_failure check(purchase_id <> %L::uuid) not valid',v_enqueue);
  insert into public.purchases(id,customer_id,square_order_id,purchase_status,
    import_status,award_status,source_channel,total_amount,currency_code,completed_at,
    destination_region,destination_country_code)
  values (v_enqueue,v_cust,'g9-synthetic-'||v_enqueue,'completed','attached','blocked',
    'history_import',10,'USD','2026-10-15 17:00+00','WA','US');
  select count(*) into v_n from public.purchases where id=v_enqueue;
  if v_n<>1 then raise exception 'queue failure rolled back purchase'; end if;
  alter table public.pj_state_evaluation_queue drop constraint g9_synthetic_queue_failure;
  perform public.pj_state_reconcile_queue(100);
  perform public.pj_state_process_queue(100);
  select count(*) into v_n from public.pj_state_purchase_credits where purchase_id=v_enqueue;
  if v_n<>1 then raise exception 'reconciliation did not recover missed enqueue'; end if;
  v_r:=v_r||jsonb_build_object('enqueue_failure_and_reconciliation','PASS');

  -- Guard against an over-credit from this entire synthetic set.
  select count(*) into v_n from public.pj_state_purchase_credits
    where purchase_id=any(array[v_a,v_b,v_old,v_late,v_attach,v_nj,v_ny,v_pa,v_fail,v_enqueue]);
  if v_n<>9 then raise exception 'expected nine credits; got %',v_n; end if;
  v_r:=v_r||jsonb_build_object('total_credits','9 / 9','test_mode','rollback_only');

  -- Roll back ALL synthetic changes while preserving an in-session report.
  raise exception using errcode='PZ001',message='synthetic test rollback';
 exception when sqlstate 'PZ001' then
  insert into pg_temp.g9_test_report(report) values (v_r);
 when others then
  insert into pg_temp.g9_test_report(report)
   values(v_r||jsonb_build_object('failure',SQLSTATE||': '||SQLERRM));
 end;
end
$test$;
select report from pg_temp.g9_test_report;
