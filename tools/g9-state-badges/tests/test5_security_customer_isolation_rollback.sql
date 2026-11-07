-- G9 TEST 5 — actual isolated Supabase Testing owner isolation and fail-closed RPC.
-- Rollback-only: Every Auth/Profile/Purchase/Queue/Credit/Secret fixture exists
-- solely inside a PL/pgSQL subtransaction that deliberately raises SQLSTATE PZ001.
create temp table pg_temp.g9_t5_log(result jsonb) on commit drop;
do $test5$
declare
  v_owner uuid:=gen_random_uuid();
  v_other uuid:=gen_random_uuid();
  v_guest uuid:=gen_random_uuid();
  v_result jsonb:='{}'::jsonb;
  v_read jsonb;
  v_pass jsonb;
  v_customer_count int;
  v_rejected boolean;
begin
  begin
    if (select count(*) from public.purchases)<>0 then
       raise exception 'Unexpected active Testing purchases; abort isolated fixture';
    end if;
    insert into auth.users
      (id,instance_id,aud,role,email,email_confirmed_at,created_at,updated_at,raw_app_meta_data)
    select id,'00000000-0000-0000-0000-000000000000'::uuid,
      'authenticated','authenticated','g9-t5-rollback-'||id::text||'@pepperjunction401.com',
      now(),now(),now(),'{"provider":"email","providers":["email"]}'::jsonb
    from (values (v_owner),(v_other),(v_guest)) as u(id);
    update public.customer_profiles set account_state='verified_matched'
      where id in (v_owner,v_other);
    if (select count(*) from public.customer_profiles
       where id in (v_owner,v_other) and account_state='verified_matched')<>2
    then raise exception 'Verified profile fixture missing';end if;

    -- Owner earns an entire division and its earned-only secret.
    insert into public.purchases
      (id,customer_id,square_order_id,purchase_status,import_status,award_status,
       source_channel,total_amount,currency_code,completed_at,destination_region,destination_country_code)
    select gen_random_uuid(),v_owner,'G9_T5_OWNER_'||replace(v_owner::text,'-','')||'_'||x.state_code,
      'completed','attached','blocked','history_import',0,'USD',
      timestamptz '2026-11-07 20:00:00+00'+x.seq*interval '1 minute',x.state_code,'US'
    from (values ('CT',1),('ME',2),('MA',3),('NH',4),('RI',5),('VT',6)) as x(state_code,seq);

    -- Another verified customer earns one unrelated State. No secret.
    insert into public.purchases
      (id,customer_id,square_order_id,purchase_status,import_status,award_status,
       source_channel,total_amount,currency_code,completed_at,destination_region,destination_country_code)
    values(gen_random_uuid(),v_other,'G9_T5_OTHER_'||replace(v_other::text,'-',''),
      'completed','attached','blocked','history_import',0,'USD',
      timestamptz '2026-11-07 21:00:00+00','AR','US');

    v_pass:=public.pj_state_process_queue(7);
    if v_pass->>'credited'<>'7' then
       raise exception 'Could not award owner/other fixtures through existing G9 queue: %',v_pass;
    end if;
    if (select count(*) from public.pj_state_secret_awards where customer_id=v_owner)<>1
       or (select count(*) from public.pj_state_secret_awards where customer_id=v_other)<>0
    then raise exception 'Secret test fixture invalid';end if;
    v_result:=v_result||jsonb_build_object('test_fixture_real_g9_7_credits_1_secret','PASS');

    -- The SECURITY DEFINER projection uses auth.uid(), never a caller UID arg.
    perform set_config('request.jwt.claim.sub',v_owner::text,true);
    v_read:=public.pj_state_my_collection();
    if v_read->>'status'<>'verified'
       or jsonb_array_length(v_read->'states')<>6
       or jsonb_array_length(v_read->'earned_divisions')<>1
       or v_read->'earned_divisions'->0->>'division_name'<>'New England'
    then raise exception 'Owner should see own six States and one earned secret';end if;
    v_result:=v_result||jsonb_build_object('owner_reads_only_own_earned_secrets','PASS');

    perform set_config('request.jwt.claim.sub',v_other::text,true);
    v_read:=public.pj_state_my_collection();
    if v_read->>'status'<>'verified'
       or jsonb_array_length(v_read->'states')<>1
       or v_read->'states'->0->>'state_code'<>'AR'
       or jsonb_array_length(v_read->'earned_divisions')<>0
    then raise exception 'Other verified customer received another account''s awards';end if;
    v_result:=v_result||jsonb_build_object('cross_customer_collection_isolation','PASS');

    -- A real Auth user without Phase 1 verified_matched status gets no awards.
    perform set_config('request.jwt.claim.sub',v_guest::text,true);
    v_read:=public.pj_state_my_collection();
    if v_read->>'status'<>'identity_not_verified'
       or jsonb_array_length(v_read->'states')<>0
       or jsonb_array_length(v_read->'earned_divisions')<>0
    then raise exception 'Unverified test user received award metadata';end if;
    v_result:=v_result||jsonb_build_object('unverified_account_no_collection','PASS');

    -- Even the owner's previously earned awards are concealed if the verified
    -- account gate is lost; no automatic revocation / earned write happens.
    update public.customer_profiles set account_state='verified_unmatched' where id=v_owner;
    perform set_config('request.jwt.claim.sub',v_owner::text,true);
    v_read:=public.pj_state_my_collection();
    if v_read->>'status'<>'identity_not_verified'
       or jsonb_array_length(v_read->'states')<>0
       or jsonb_array_length(v_read->'earned_divisions')<>0
       or (select count(*) from public.pj_state_purchase_credits where customer_id=v_owner)<>6
    then raise exception 'Revoked verified-match should hide, not destroy, awards';end if;
    v_result:=v_result||jsonb_build_object('verification_gate_hides_preserved_awards','PASS');

    -- No auth.uid()/JWT identity: the RPC must explicitly reject invocation.
    perform set_config('request.jwt.claim.sub','',true);
    v_rejected:=false;
    begin
      perform public.pj_state_my_collection();
    exception when sqlstate '28000' then v_rejected:=true;
    end;
    if not v_rejected then raise exception 'Anonymous collection read did not reject';end if;
    v_result:=v_result||jsonb_build_object('missing_auth_claim_rejected','PASS');

    -- Role grants: these are authorization checks, not RPC execution.
    if exists(
      select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public'
        and c.relname in('pj_state_customer_levels','pj_state_purchase_credits','pj_state_secret_awards',
          'pj_state_evaluation_queue','pj_state_registry','pj_state_divisions')
        and (not c.relrowsecurity
          or has_table_privilege('anon',c.oid,'SELECT')
          or has_table_privilege('authenticated',c.oid,'SELECT')
          or has_table_privilege('anon',c.oid,'INSERT')
          or has_table_privilege('authenticated',c.oid,'INSERT')
          or has_table_privilege('authenticated',c.oid,'UPDATE')
          or has_table_privilege('authenticated',c.oid,'DELETE'))
    ) then raise exception 'G9 table privileges/RLS broadened unexpectedly';end if;
    v_result:=v_result||jsonb_build_object('state_tables_direct_read_write_denied','PASS');

    if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in
        ('pj_state_enqueue_from_purchase','pj_state_evaluate_purchase','pj_state_process_queue','pj_state_reconcile_queue')
        and (has_function_privilege('anon',p.oid,'EXECUTE')
          or has_function_privilege('authenticated',p.oid,'EXECUTE')))
    then raise exception 'G9 evaluator/worker available to non-service role';end if;
    v_result:=v_result||jsonb_build_object('evaluation_worker_rpc_denied_to_clients','PASS');

    raise exception 'G9_TEST5_ROLLBACK' using errcode='PZ001';
  exception when sqlstate 'PZ001' then
    insert into pg_temp.g9_t5_log values (v_result||jsonb_build_object('result','PASS','all_fixture_writes_rolled_back',true));
  when others then
    insert into pg_temp.g9_t5_log values (v_result||jsonb_build_object('result','FAIL','detail',sqlstate||': '||sqlerrm,
        'all_fixture_writes_rolled_back',true));
  end;
end $test5$;
select result from pg_temp.g9_t5_log;