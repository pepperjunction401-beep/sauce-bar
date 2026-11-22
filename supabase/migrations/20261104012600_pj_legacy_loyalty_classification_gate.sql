-- PJ legacy membership classification, presentation-safe and fail-closed.
-- No wallet updates, historical purchase replay, account re-link, or badges.
create function public.pj_legacy_loyalty_classify(p_customer_id uuid)
returns jsonb language plpgsql stable security invoker
set search_path=pg_catalog,public,pg_temp as $$
declare
 v_state record;
 v_account_state text;
 v_links integer;
 v_members integer;
 v_missing integer;
 v_ids integer;
 v_balance integer;
 v_account text;
begin
 select * into v_state from public.pj_legacy_loyalty_activation where singleton=true;
 if not found or v_state.snapshot_id is null then
   return jsonb_build_object('status','pending_snapshot');
 end if;
 if not exists(select 1 from public.pj_legacy_loyalty_snapshots s
   where s.id=v_state.snapshot_id and s.state='sealed' and s.accounts_complete) then
   return jsonb_build_object('status','pending_snapshot');
 end if;
 select c.account_state into v_account_state
   from public.customer_profiles c where c.id=p_customer_id;
 if v_account_state is distinct from 'verified_matched' then
   return jsonb_build_object('status','identity_unverified');
 end if;
 select count(*),count(distinct square_customer_id)
   into v_links,v_ids from public.square_customer_links
   where customer_id=p_customer_id and (is_active or is_historical_alias);
 if v_links=0 or v_ids=0 then
   return jsonb_build_object('status','identity_unverified');
 end if;
 select count(*), count(*) filter(where m.square_available_points is null or m.square_available_points<0),
        max(m.square_available_points),max(m.square_loyalty_account_id)
   into v_members,v_missing,v_balance,v_account
 from public.pj_legacy_loyalty_members m
 where m.snapshot_id=v_state.snapshot_id
 and exists(select 1 from public.square_customer_links l
   where l.customer_id=p_customer_id
   and (l.is_active or l.is_historical_alias)
   and l.square_customer_id=m.square_customer_id);
 if v_members>1 or v_missing>0 then
   return jsonb_build_object('status','manual_review_required');
 end if;
 if v_members=1 then
   return jsonb_build_object('status','legacy_member',
      'square_loyalty_account_id',v_account,
      'square_available_points',v_balance,
      'tentative_transfer_cap',least(275,v_balance),
      'claim_status','unclaimed',
      'transfer_enabled',v_state.transfers_enabled);
 end if;
 if exists(
   select 1 from public.pj_legacy_loyalty_members m
   join public.square_customer_links l
     on l.square_customer_id=m.square_customer_id
   where m.snapshot_id=v_state.snapshot_id
     and l.customer_id<>p_customer_id
     and (l.is_active or l.is_historical_alias)
     and m.square_customer_id in (
       select square_customer_id from public.square_customer_links
       where customer_id=p_customer_id and (is_active or is_historical_alias)
     )
 ) then return jsonb_build_object('status','manual_review_required');
 end if;
 return jsonb_build_object('status','nonmember_cns_only',
    'historical_earning_enabled',v_state.nonmember_history_enabled);
end $$;
revoke all on function public.pj_legacy_loyalty_classify(uuid) from public,anon,authenticated;
grant execute on function public.pj_legacy_loyalty_classify(uuid) to service_role;

-- User-facing non-sensitive classification, using existing verified auth identity.
create function public.pj_legacy_loyalty_my_status()
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'IDENTITY_REQUIRED' using errcode='28000'; end if;
 select public.pj_legacy_loyalty_classify(auth.uid()) into result;
 return jsonb_build_object('status',result->>'status');
end $$;
revoke all on function public.pj_legacy_loyalty_my_status() from public,anon,authenticated,service_role;
grant execute on function public.pj_legacy_loyalty_my_status() to authenticated;
