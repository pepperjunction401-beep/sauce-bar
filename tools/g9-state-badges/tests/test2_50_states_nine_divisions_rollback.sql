-- G9 Test 2: exhaustive, rollback-contained isolated Testing database exercise.
-- Never execute on Production. This file is a test; it changes no schema.
-- 50 unique states, 9 secret divisions, no premature secrets, repeat levels,
-- purchase-specific attribution, idempotence, collection ownership and scope.
-- All Auth users/purchases/awards/queues created inside the nested block are
-- rolled back by an intentionally raised SQLSTATE PZ001 before returning results.
create temp table pg_temp.g9_t2_log(results jsonb) on commit drop;
do $g9test2$
declare
  v_owner uuid:=gen_random_uuid();
  v_other uuid:=gen_random_uuid();
  v_p record;
  v_count integer;
  v_result jsonb:='{}'::jsonb;
  v_batch jsonb;
  v_owner_collection jsonb;
  v_other_collection jsonb;
  v_ripurchase uuid;
  v_all_complete boolean:=false;
begin
  begin
    if (select count(*) from public.pj_state_registry)<>50 or
       (select count(*) from public.pj_state_divisions)<>9
    then raise exception 'Registry not exactly 50 states / 9 divisions';end if;
    if exists(select 1 from public.pj_state_registry where state_code='DC')
       or not exists(select 1 from public.pj_state_registry where state_code='AR' and division_code='west_south_central')
       or not exists(select 1 from public.pj_state_registry where state_code='LA' and division_code='west_south_central')
       or not exists(select 1 from public.pj_state_registry where state_code='TN' and art_path='assets/badges/states/badges-states-tennesee.png')
    then raise exception 'State Census / DC / Tennessee filename map mismatch'; end if;
    if exists(select 1 from public.pj_state_divisions d left join
      (select division_code,count(*) qty from public.pj_state_registry group by division_code) r
      on r.division_code=d.division_code
      where r.qty is distinct from d.required_state_count)
    then raise exception 'Census division state counts mismatch'; end if;
    -- Independent explicit U.S. Census 50-state-to-nine-division manifest.
    -- This is test-only evidence, not a second registry or application logic.
    if exists(
      with expected(state_code,division_code) as (values ('CT','new_england'),
        ('ME','new_england'),
        ('MA','new_england'),
        ('NH','new_england'),
        ('RI','new_england'),
        ('VT','new_england'),
        ('NJ','middle_atlantic'),
        ('NY','middle_atlantic'),
        ('PA','middle_atlantic'),
        ('IL','east_north_central'),
        ('IN','east_north_central'),
        ('MI','east_north_central'),
        ('OH','east_north_central'),
        ('WI','east_north_central'),
        ('IA','west_north_central'),
        ('KS','west_north_central'),
        ('MN','west_north_central'),
        ('MO','west_north_central'),
        ('NE','west_north_central'),
        ('ND','west_north_central'),
        ('SD','west_north_central'),
        ('DE','south_atlantic'),
        ('FL','south_atlantic'),
        ('GA','south_atlantic'),
        ('MD','south_atlantic'),
        ('NC','south_atlantic'),
        ('SC','south_atlantic'),
        ('VA','south_atlantic'),
        ('WV','south_atlantic'),
        ('AL','east_south_central'),
        ('KY','east_south_central'),
        ('MS','east_south_central'),
        ('TN','east_south_central'),
        ('AR','west_south_central'),
        ('LA','west_south_central'),
        ('OK','west_south_central'),
        ('TX','west_south_central'),
        ('AZ','mountain'),
        ('CO','mountain'),
        ('ID','mountain'),
        ('MT','mountain'),
        ('NV','mountain'),
        ('NM','mountain'),
        ('UT','mountain'),
        ('WY','mountain'),
        ('AK','pacific'),
        ('CA','pacific'),
        ('HI','pacific'),
        ('OR','pacific'),
        ('WA','pacific'))
      select state_code,division_code from expected
      except select state_code,division_code from public.pj_state_registry
    ) or exists(
      with expected(state_code,division_code) as (values ('CT','new_england'),
        ('ME','new_england'),
        ('MA','new_england'),
        ('NH','new_england'),
        ('RI','new_england'),
        ('VT','new_england'),
        ('NJ','middle_atlantic'),
        ('NY','middle_atlantic'),
        ('PA','middle_atlantic'),
        ('IL','east_north_central'),
        ('IN','east_north_central'),
        ('MI','east_north_central'),
        ('OH','east_north_central'),
        ('WI','east_north_central'),
        ('IA','west_north_central'),
        ('KS','west_north_central'),
        ('MN','west_north_central'),
        ('MO','west_north_central'),
        ('NE','west_north_central'),
        ('ND','west_north_central'),
        ('SD','west_north_central'),
        ('DE','south_atlantic'),
        ('FL','south_atlantic'),
        ('GA','south_atlantic'),
        ('MD','south_atlantic'),
        ('NC','south_atlantic'),
        ('SC','south_atlantic'),
        ('VA','south_atlantic'),
        ('WV','south_atlantic'),
        ('AL','east_south_central'),
        ('KY','east_south_central'),
        ('MS','east_south_central'),
        ('TN','east_south_central'),
        ('AR','west_south_central'),
        ('LA','west_south_central'),
        ('OK','west_south_central'),
        ('TX','west_south_central'),
        ('AZ','mountain'),
        ('CO','mountain'),
        ('ID','mountain'),
        ('MT','mountain'),
        ('NV','mountain'),
        ('NM','mountain'),
        ('UT','mountain'),
        ('WY','mountain'),
        ('AK','pacific'),
        ('CA','pacific'),
        ('HI','pacific'),
        ('OR','pacific'),
        ('WA','pacific'))
      select state_code,division_code from public.pj_state_registry
      except select state_code,division_code from expected
    ) then raise exception 'Wrong State-to-Census division assignment';end if;
    v_result=v_result||jsonb_build_object('state_registry_50','PASS','divisions_9','PASS','exact_50_census_assignments','PASS',
      'dc_excluded_ar_la_tn','PASS');

    insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,created_at,updated_at,raw_app_meta_data)
    select id,'00000000-0000-0000-0000-000000000000'::uuid,'authenticated','authenticated',
     'g9-t2-rollback-'||id::text||'@pepperjunction401.com',now(),now(),now(),
     '{"provider":"email","providers":["email"]}'::jsonb
    from (values(v_owner),(v_other)) as users(id);
    update public.customer_profiles set account_state='verified_matched' where id in (v_owner,v_other);
    if (select count(*) from public.customer_profiles where id in(v_owner,v_other) and account_state='verified_matched')<>2
      then raise exception 'Synthetic profile setup failed'; end if;

    -- FIRST: 41 non-final States. Timestamp ordering forces these first,
    -- despite insert/trigger order not being guaranteed.
    with numbered as (
      select s.state_code,s.division_code,d.required_state_count,
        row_number() over(partition by s.division_code order by s.state_code) as within_division
      from public.pj_state_registry s join public.pj_state_divisions d on d.division_code=s.division_code
    ), ordered as (
      select *,row_number() over(order by (within_division=required_state_count),division_code,state_code) as seq
      from numbered
    )
    insert into public.purchases
      (id,customer_id,square_order_id,purchase_status,import_status,award_status,
       source_channel,total_amount,currency_code,completed_at,destination_region,destination_country_code)
    select gen_random_uuid(),v_owner,'G9_T2_STATE_'||v_owner::text||'_'||state_code,
       'completed','attached','blocked','history_import',0,'USD',
       timestamptz '2026-11-07 12:00:00+00' + seq*interval '1 minute',state_code,'US'
    from ordered;
    if (select count(*) from public.pj_state_evaluation_queue q join public.purchases p on p.id=q.purchase_id
       where p.customer_id=v_owner)<>50 then raise exception 'All 50 State purchases not enqueued'; end if;

    v_batch:=public.pj_state_process_queue(41);
    if (v_batch->>'credited')::int<>41 or (v_batch->>'failed')::int<>0 then
      raise exception 'First batch did not credit exactly 41 purchases: %',v_batch;end if;
    if exists(select 1 from public.pj_state_secret_awards where customer_id=v_owner) then
       raise exception 'PREMATURE SECRET: no division should be complete at 41';end if;
    if (select count(*) from public.pj_state_purchase_credits where customer_id=v_owner)<>41 then
       raise exception '41-State partial ownership mismatch';end if;
    v_result=v_result||jsonb_build_object('no_premature_division_secrets_after_41','PASS',
      'first_41_state_credits','PASS');

    -- Nine final states now earn exactly nine distinct division secrets.
    v_batch:=public.pj_state_process_queue(9);
    if (v_batch->>'credited')::int<>9 or (v_batch->>'failed')::int<>0 then
      raise exception 'Final nine state credits failed: %',v_batch;end if;
    if (select count(*) from public.pj_state_purchase_credits where customer_id=v_owner)<>50
      or (select count(distinct state_code) from public.pj_state_purchase_credits where customer_id=v_owner)<>50
      or (select count(*) from public.pj_state_customer_levels where customer_id=v_owner and level=1)<>50
      or (select count(*) from public.pj_state_secret_awards where customer_id=v_owner)<>9
      or (select count(distinct division_code) from public.pj_state_secret_awards where customer_id=v_owner)<>9
    then raise exception 'Complete collection requires 50 State level-1 awards and nine secrets';end if;

    -- The secret's source purchase must credit a state IN THAT division,
    -- and must be the last completed purchase in the division. This checks
    -- the earning-event foreign key, not timestamps as client evidence.
    if exists(
      select 1 from public.pj_state_secret_awards sec
      join public.pj_state_purchase_credits credit on credit.purchase_id=sec.source_purchase_id
      join public.pj_state_registry reg on reg.state_code=credit.state_code
      where sec.customer_id=v_owner and
      (reg.division_code<>sec.division_code or credit.customer_id<>v_owner
       or credit.completed_at < (
         select max(c2.completed_at)
         from public.pj_state_purchase_credits c2
         join public.pj_state_registry r2 on r2.state_code=c2.state_code
         where c2.customer_id=v_owner and r2.division_code=sec.division_code
       ))
    ) then raise exception 'A division secret was attributed to the wrong final-state checkout';end if;

    if exists(select 1 from public.pj_state_evaluation_queue q
      join public.purchases p on p.id=q.purchase_id
      where p.customer_id=v_owner and q.status<>'done')
    then raise exception 'Completed State jobs not marked done'; end if;
    v_result=v_result||jsonb_build_object('all_50_state_badges_level_1','PASS',
      'all_9_earned_division_secrets','PASS',
      'all_9_secrets_attributed_to_last_state_checkout','PASS');

    -- An independent customer gets one state, never another customer's award.
    insert into public.purchases
      (id,customer_id,square_order_id,purchase_status,import_status,award_status,
       source_channel,total_amount,currency_code,completed_at,destination_region,destination_country_code)
    values (gen_random_uuid(),v_other,'G9_T2_OTHER_'||v_other::text,
      'completed','attached','blocked','history_import',0,'USD',
      timestamptz '2026-11-07 15:00:00+00','AR','US');
    v_batch:=public.pj_state_process_queue(1);
    if (v_batch->>'credited')::int<>1 or
       (select count(*) from public.pj_state_secret_awards where customer_id=v_other)<>0
    then raise exception 'Other customer award/isolation error: %',v_batch;end if;

    -- RI earned Level 1 previously; 11 more distinct RI purchases advance to
    -- Levels 2..12. The award credit must capture the level AT EACH PURCHASE,
    -- rather than retrieving today's aggregate level for earlier checkouts.
    insert into public.purchases
      (id,customer_id,square_order_id,purchase_status,import_status,award_status,
       source_channel,total_amount,currency_code,completed_at,destination_region,destination_country_code)
    select gen_random_uuid(),v_owner,'G9_T2_RI_L'||n::text,
      'completed','attached','blocked','history_import',0,'USD',
      timestamptz '2026-11-07 16:00:00+00' + n*interval '1 minute','RI','US'
    from generate_series(2,12) as n;
    v_batch:=public.pj_state_process_queue(11);
    if (v_batch->>'credited')::int<>11 then raise exception 'RI 11-level increment batch failed: %',v_batch;end if;

    if (select level from public.pj_state_customer_levels where customer_id=v_owner and state_code='RI')<>12
      or (select count(*) from public.pj_state_purchase_credits where customer_id=v_owner and state_code='RI')<>12
      or exists(
        select 1 from public.pj_state_purchase_credits c
        join public.purchases p on p.id=c.purchase_id
        where p.customer_id=v_owner and p.square_order_id like 'G9_T2_RI_L%'
          and c.awarded_level<>regexp_replace(p.square_order_id,'^G9_T2_RI_L','')::integer
      )
      or (select count(*) from public.pj_state_secret_awards where customer_id=v_owner)<>9
    then raise exception 'RI level 2..12 order attribution or secret duplication failed';end if;

    -- Replay an existing Square order: it must not increment the collection.
    select id into v_ripurchase from public.purchases where customer_id=v_owner and square_order_id='G9_T2_RI_L8';
    if public.pj_state_evaluate_purchase(v_ripurchase)<>'already_credited' then
       raise exception 'Replay did not report already credited';end if;
    v_batch:=public.pj_state_process_queue(50);
    if (v_batch->>'handled')::int<>0 or
       (select level from public.pj_state_customer_levels where customer_id=v_owner and state_code='RI')<>12
    then raise exception 'Replay or idle worker duplicated earned State level';end if;
    v_result=v_result||jsonb_build_object('ri_level_12_and_each_checkout_exact_level','PASS',
      'replay_idempotence_no_duplicate','PASS');

    -- The deployed customer reader may return only awarded States and earned
    -- secrets belonging to auth.uid(); never publish secret registry previews.
    perform set_config('request.jwt.claim.sub',v_owner::text,true);
    v_owner_collection:=public.pj_state_my_collection();
    if v_owner_collection->>'status'<>'verified' or
       jsonb_array_length(v_owner_collection->'states')<>50 or
       jsonb_array_length(v_owner_collection->'earned_divisions')<>9 or
       not exists(select 1 from jsonb_array_elements(v_owner_collection->'states') x
                  where x->>'state_code'='RI' and (x->>'level')::int=12)
    then raise exception 'Owner collection reader does not return 50 States/9 earned secrets: %',v_owner_collection;end if;
    perform set_config('request.jwt.claim.sub',v_other::text,true);
    v_other_collection:=public.pj_state_my_collection();
    if v_other_collection->>'status'<>'verified' or
       jsonb_array_length(v_other_collection->'states')<>1 or
       v_other_collection->'states'->0->>'state_code'<>'AR' or
       jsonb_array_length(v_other_collection->'earned_divisions')<>0
    then raise exception 'Other customer saw unexpected State/secret collection: %',v_other_collection;end if;
    v_result:=v_result||jsonb_build_object('customer_scoped_read_only_collection','PASS',
      'no_unearned_secrets_in_other_customer_response','PASS',
      'total_purchase_credits_tested',62,'distinct_states_tested',50,
      'earned_division_secrets_tested',9,'repeat_ri_levels_tested',12);

    -- Always throw away all synthetic Auth, Profiles, Purchases, Q, Credit,
    -- Levels, Secrets and unrelated trigger side effects before committing.
    raise exception 'ROLLBACK G9 TEST2 PASS' using errcode='PZ001';
  exception
    when sqlstate 'PZ001' then
      insert into pg_temp.g9_t2_log
        values(v_result||jsonb_build_object('outcome','PASS','all_synthetic_data_rolled_back',true));
    when others then
      insert into pg_temp.g9_t2_log
        values(v_result||jsonb_build_object('outcome','FAIL','error',sqlstate||': '||sqlerrm,
                                            'all_synthetic_data_rolled_back',true));
  end;
end $g9test2$;
select results from pg_temp.g9_t2_log;