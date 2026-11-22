-- Pepper Junction — customer-authenticated Loyalty Bridge onboarding handoff.
-- No Phase 1/2 matching edits, no checkout/cart triggers, no automatic replay.
-- This is a browser-callable wrapper with AUTH-ONLY identity. Existing legacy
-- worker remains service-role only; existing owner switches remain FALSE.
--
-- Before approved launch, this call is deliberately read-only and returns
-- pending (even for customers with matching Square IDs). No points are posted.
create function public.pj_loyalty_my_onboarding()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,auth,pg_temp
as $$
declare
 v_customer uuid;
 v_gate record;
 v_class jsonb;
 v_claim jsonb;
begin
 v_customer:=auth.uid();
 if v_customer is null then
   raise exception 'PJ_LOYALTY_SIGNIN_REQUIRED' using errcode='28000';
 end if;
 -- Strictly reuse Phase 1 verified Square customer ownership.
 if not exists (
   select 1 from public.customer_profiles p
   where p.id=v_customer and p.account_state='verified_matched'
 ) then
   return jsonb_build_object('status','identity_not_verified',
      'awarded',false);
 end if;
 select snapshot_id,transfers_enabled,nonmember_history_enabled
   into v_gate from public.pj_legacy_loyalty_activation
   where singleton=true;
 if not found or v_gate.snapshot_id is null then
   return jsonb_build_object('status','pending_legacy_snapshot','awarded',false);
 end if;
 if not exists (
   select 1 from public.pj_legacy_loyalty_snapshots s
   where s.id=v_gate.snapshot_id and s.state='sealed'
     and s.accounts_complete
 ) then
   return jsonb_build_object('status','pending_legacy_snapshot','awarded',false);
 end if;

 v_class:=public.pj_legacy_loyalty_classify(v_customer);
 if v_class->>'status'='legacy_member' then
   if not v_gate.transfers_enabled then
     return jsonb_build_object('status','legacy_transfer_pending','awarded',false);
   end if;
   -- The worker locks the wallet and ensures the unique source ledger event.
   -- No user-supplied customer or token IDs accepted.
   v_claim:=public.pj_legacy_loyalty_claim_verified(v_customer);
   return jsonb_build_object(
     'status',case v_claim->>'status'
       when 'claimed' then 'legacy_transfer_complete'
       when 'already_claimed' then 'legacy_transfer_complete'
       else 'legacy_transfer_held' end,
     'awarded',v_claim->>'status'='claimed',
     'reason',case when v_claim->>'status' in ('claimed','already_claimed')
       then null else v_claim->>'reason' end);
 elsif v_class->>'status'='nonmember_cns_only' then
   -- Intentional: no historical writes or replay on sign-in.
   return jsonb_build_object('status',case
     when v_gate.nonmember_history_enabled
       then 'nonmember_history_requires_controlled_replay'
     else 'nonmember_history_pending' end,
     'awarded',false);
 else
   return jsonb_build_object(
     'status',case v_class->>'status'
       when 'manual_review_required' then 'identity_review_required'
       when 'identity_unverified' then 'identity_not_verified'
       else 'pending_legacy_snapshot' end,
     'awarded',false);
 end if;
end;
$$;
-- Browser access only as logged-in customer; no direct source access.
revoke all on function public.pj_loyalty_my_onboarding() from public,anon,authenticated,service_role;
grant execute on function public.pj_loyalty_my_onboarding() to authenticated;
comment on function public.pj_loyalty_my_onboarding() is
 'Owner-gated sign-in handoff: before Square cohort cutover it is read-only; after activation it can claim only the authenticated verified customer one time.';
