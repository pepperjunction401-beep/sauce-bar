-- Complete account balances determine cohort freeze. Events/rewards optional.
-- Does not bypass missing customer IDs, duplicate identities, invalid totals, or approval gates.
create or replace function public.pj_legacy_loyalty_seal_snapshot(p_snapshot_id uuid)
returns jsonb language plpgsql security invoker
set search_path=pg_catalog,public,pg_temp as $$
declare
 r record;
 v_count integer;
 v_bad integer;
 v_duplicates integer;
 v_other integer;
begin
 select * into r from public.pj_legacy_loyalty_snapshots
 where id=p_snapshot_id for update;
 if not found then return jsonb_build_object('status','missing'); end if;
 if r.state='sealed' then return jsonb_build_object('status','already_sealed'); end if;
 if not r.accounts_complete then
   return jsonb_build_object('status','held','reason','incomplete_square_accounts');
 end if;
 select count(*) into v_count from public.pj_legacy_loyalty_members
 where snapshot_id=p_snapshot_id;
 if v_count<>r.expected_accounts then
   return jsonb_build_object('status','held','reason','account_count_mismatch',
    'expected',r.expected_accounts,'observed',v_count);
 end if;
 if v_count=0 then
   return jsonb_build_object('status','held','reason','empty_membership_capture');
 end if;
 select count(*) into v_bad
 from public.pj_legacy_loyalty_members
 where snapshot_id=p_snapshot_id
 and (square_customer_id is null or square_available_points is null
   or square_available_points<0 or square_lifetime_points is null
   or square_lifetime_points<0);
 if v_bad>0 then
   return jsonb_build_object('status','held','reason','unresolved_square_accounts','count',v_bad);
 end if;
 select count(*) into v_duplicates from (
  select square_customer_id from public.pj_legacy_loyalty_members
  where snapshot_id=p_snapshot_id
  group by square_customer_id having count(*)>1
 ) d;
 if v_duplicates>0 then
   return jsonb_build_object('status','held','reason','ambiguous_customer_id','count',v_duplicates);
 end if;
 select count(*) into v_other from public.pj_legacy_loyalty_snapshots
 where source_program_id=r.source_program_id and state='sealed';
 if v_other>0 then
   return jsonb_build_object('status','held','reason','program_already_has_sealed_snapshot');
 end if;
 update public.pj_legacy_loyalty_snapshots
 set state='sealed',sealed_at=now() where id=p_snapshot_id;
 return jsonb_build_object('status','sealed','count',v_count,
   'transfers_enabled',false,'nonmember_history_enabled',false);
end $$;
