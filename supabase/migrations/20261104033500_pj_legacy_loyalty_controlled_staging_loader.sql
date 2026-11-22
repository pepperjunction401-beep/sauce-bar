-- PJ legacy loyalty: private, validation-only staging into the established register.
-- Service-role-only functions. No Square API calls, no wallets, no points transfers.
create function public.pj_legacy_loyalty_stage_begin(p_summary jsonb)
returns uuid language plpgsql security invoker
set search_path=pg_catalog,public,pg_temp as $$
declare
 v_id uuid;
 v_count integer;
 v_program text;
 v_sha text;
 v_started timestamptz;
 v_finished timestamptz;
begin
 if jsonb_typeof(p_summary) is distinct from 'object'
  or p_summary->>'accountsComplete' is distinct from 'true'
  or (p_summary->>'archiveFingerprintSha256') !~ '^[0-9a-f]{64}$'
  or nullif(btrim(p_summary->>'squareProgramId'),'') is null
  or coalesce(length(p_summary->>'squareProgramId'),0)>128
  or nullif(btrim(p_summary->>'squareApiVersion'),'') is null
  or (p_summary->>'expectedAccounts') !~ '^[1-9][0-9]{0,5}$'
 then raise exception 'PJ_LEGACY_STAGE_INVALID_CAPTURE_SUMMARY'; end if;
 v_count:=(p_summary->>'expectedAccounts')::integer;
 v_program:=p_summary->>'squareProgramId';
 v_sha:=p_summary->>'archiveFingerprintSha256';
 begin
  v_started:=(p_summary->>'captureStartedAt')::timestamptz;
  v_finished:=(p_summary->>'captureFinishedAt')::timestamptz;
 exception when others then raise exception 'PJ_LEGACY_STAGE_INVALID_CAPTURE_TIMES'; end;
 if v_started is null or v_finished is null
  or v_finished<v_started or v_finished>now()+interval '10 minutes' then
  raise exception 'PJ_LEGACY_STAGE_INVALID_CAPTURE_WINDOW';
 end if;
 select s.id into v_id from public.pj_legacy_loyalty_snapshots s
  where s.source_program_id=v_program and s.archive_sha256=v_sha;
 if found then
  if not exists(select 1 from public.pj_legacy_loyalty_snapshots s where s.id=v_id
     and s.expected_accounts=v_count and s.capture_started_at=v_started
     and s.capture_finished_at=v_finished and s.state='staging'
     and s.square_api_version=p_summary->>'squareApiVersion') then
   raise exception 'PJ_LEGACY_STAGE_EXISTING_SNAPSHOT_MISMATCH';
  end if;
  return v_id;
 end if;
 insert into public.pj_legacy_loyalty_snapshots (
  source_program_id,square_api_version,capture_started_at,capture_finished_at,
  archive_sha256,expected_accounts,accounts_complete,events_complete,rewards_complete
 ) values (
  v_program,p_summary->>'squareApiVersion',v_started,v_finished,v_sha,v_count,
  true,coalesce((p_summary->>'eventsComplete')::boolean,false),
  coalesce((p_summary->>'rewardsComplete')::boolean,false)
 ) returning id into v_id;
 return v_id;
end $$;

create function public.pj_legacy_loyalty_stage_batch(p_snapshot_id uuid, p_members jsonb)
returns jsonb language plpgsql security invoker
set search_path=pg_catalog,public,pg_temp as $$
declare
 rowdata jsonb; v_count integer:=0;
 v_account text; v_customer text; v_balance integer; v_lifetime integer;
 v_source timestamptz; v_existing record; v_hash text;
begin
 if jsonb_typeof(p_members) is distinct from 'array' or
   jsonb_array_length(p_members) not between 1 and 100 then
  raise exception 'PJ_LEGACY_BATCH_INVALID_SIZE';
 end if;
 perform 1 from public.pj_legacy_loyalty_snapshots
  where id=p_snapshot_id and state='staging' for update;
 if not found then raise exception 'PJ_LEGACY_BATCH_SNAPSHOT_NOT_STAGING'; end if;
 for rowdata in select value from jsonb_array_elements(p_members) loop
  v_account:=nullif(btrim(rowdata->>'squareLoyaltyAccountId'),'');
  v_customer:=nullif(btrim(rowdata->>'squareCustomerId'),'');
  v_hash:=rowdata->>'rawAccountSha256';
  if jsonb_typeof(rowdata) is distinct from 'object'
   or v_account is null or length(v_account)>128
   or length(coalesce(v_customer,''))>128
   or v_hash !~ '^[0-9a-f]{64}$' then
   raise exception 'PJ_LEGACY_BATCH_INVALID_MEMBER_ID';
  end if;
  if rowdata->>'outstandingPoints' is not null and
     (rowdata->>'outstandingPoints') ~ '^[0-9]{1,9}$' then
    v_balance:=(rowdata->>'outstandingPoints')::integer;
  else v_balance:=null; end if;
  if rowdata->>'lifetimePoints' is not null and
     (rowdata->>'lifetimePoints') ~ '^[0-9]{1,9}$' then
    v_lifetime:=(rowdata->>'lifetimePoints')::integer;
  else v_lifetime:=null; end if;
  begin
    v_source:=nullif(rowdata->>'sourceUpdatedAt','')::timestamptz;
  exception when others then raise exception 'PJ_LEGACY_BATCH_INVALID_SOURCE_TIME'; end;
  insert into public.pj_legacy_loyalty_members(
   snapshot_id,square_loyalty_account_id,square_customer_id,
   square_available_points,square_lifetime_points,source_updated_at,raw_account_sha256
  ) values (p_snapshot_id,v_account,v_customer,v_balance,v_lifetime,v_source,v_hash)
  on conflict(snapshot_id,square_loyalty_account_id) do nothing;
  select * into v_existing from public.pj_legacy_loyalty_members
   where snapshot_id=p_snapshot_id and square_loyalty_account_id=v_account;
  if v_existing.square_customer_id is distinct from v_customer
   or v_existing.square_available_points is distinct from v_balance
   or v_existing.square_lifetime_points is distinct from v_lifetime
   or v_existing.source_updated_at is distinct from v_source
   or v_existing.raw_account_sha256 is distinct from v_hash then
    raise exception 'PJ_LEGACY_BATCH_REPLAY_CONFLICT';
  end if;
  v_count:=v_count+1;
 end loop;
 return jsonb_build_object('status','staged','submitted',v_count,
  'stored',(select count(*) from public.pj_legacy_loyalty_members where snapshot_id=p_snapshot_id),
  'wallets_modified',0);
end $$;

create function public.pj_legacy_loyalty_stage_status(p_snapshot_id uuid)
returns jsonb language sql stable security invoker
set search_path=pg_catalog,public,pg_temp as $$
 select jsonb_build_object(
 'snapshot_id',s.id,'state',s.state,
 'expected',s.expected_accounts,'stored',(
   select count(*) from public.pj_legacy_loyalty_members m where m.snapshot_id=s.id),
 'account_capture_complete',s.accounts_complete,
 'events_complete',s.events_complete,'rewards_complete',s.rewards_complete,
 'unresolved_members',(
   select count(*) from public.pj_legacy_loyalty_members m where m.snapshot_id=s.id
   and (m.square_customer_id is null or m.square_available_points is null
     or m.square_available_points<0 or m.square_lifetime_points is null)),
 'transfer_enabled',false
 )
 from public.pj_legacy_loyalty_snapshots s where s.id=p_snapshot_id
$$;
revoke all on function public.pj_legacy_loyalty_stage_begin(jsonb)
 from public,anon,authenticated;
revoke all on function public.pj_legacy_loyalty_stage_batch(uuid,jsonb)
 from public,anon,authenticated;
revoke all on function public.pj_legacy_loyalty_stage_status(uuid)
 from public,anon,authenticated;
grant execute on function public.pj_legacy_loyalty_stage_begin(jsonb) to service_role;
grant execute on function public.pj_legacy_loyalty_stage_batch(uuid,jsonb) to service_role;
grant execute on function public.pj_legacy_loyalty_stage_status(uuid) to service_role;
