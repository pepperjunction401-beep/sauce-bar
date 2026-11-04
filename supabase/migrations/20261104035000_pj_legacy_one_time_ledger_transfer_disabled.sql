-- PJ Credits: DISABLED legacy transfer worker, downstream of frozen Square Loyalty cohort.
-- No trigger, scheduler, browser or Square caller; service role only; activation false by default.
-- Extends the existing single PJ Credits ledger with an explicit provenance event,
-- not a second rewards currency. History replay must remain held for members.
alter table public.pj_credit_ledger
  drop constraint pj_credit_ledger_event_kind_check;
alter table public.pj_credit_ledger
  add constraint pj_credit_ledger_event_kind_check
  check (event_kind in (
   'purchase_earn','loyalty_exchange','square_refund_reversal','owner_correction',
   'legacy_square_transfer'
  ));

create table public.pj_legacy_loyalty_claims (
 snapshot_id uuid not null references public.pj_legacy_loyalty_snapshots(id) on delete restrict,
 square_loyalty_account_id text not null,
 customer_id uuid not null references public.customer_profiles(id) on delete restrict,
 ledger_event_id uuid not null unique references public.pj_credit_ledger(id) on delete restrict,
 square_available_points integer not null check(square_available_points>=0),
 credits_posted integer not null check(credits_posted between 0 and 275),
 claimed_at timestamptz not null default now(),
 primary key(snapshot_id,square_loyalty_account_id),
 unique(snapshot_id,customer_id),
 foreign key(snapshot_id,square_loyalty_account_id)
   references public.pj_legacy_loyalty_members(snapshot_id,square_loyalty_account_id)
   on delete restrict
);
alter table public.pj_legacy_loyalty_claims enable row level security;
revoke all on public.pj_legacy_loyalty_claims from public,anon,authenticated,service_role;
grant select,insert on public.pj_legacy_loyalty_claims to service_role;

create function public.pj_legacy_loyalty_claim_immutable_guard()
returns trigger language plpgsql set search_path=pg_catalog,public,pg_temp as $$
begin
 raise exception 'LEGACY_LOYALTY_CLAIMS_IMMUTABLE';
end $$;
create trigger pj_legacy_loyalty_claim_immutable
 before update or delete on public.pj_legacy_loyalty_claims
 for each row execute function public.pj_legacy_loyalty_claim_immutable_guard();
revoke all on function public.pj_legacy_loyalty_claim_immutable_guard()
 from public,anon,authenticated,service_role;

create function public.pj_legacy_loyalty_claim_verified(p_customer_id uuid)
returns jsonb language plpgsql security invoker
set search_path=pg_catalog,public,pg_temp as $$
declare
 v_activation record;
 v_cohort jsonb;
 v_legacy_account text;
 v_square_points integer;
 v_balance integer;
 v_posted integer;
 v_event_id uuid;
 v_prior record;
 v_ledger_count integer;
 v_wallet_exists boolean;
begin
 if p_customer_id is null then
  return jsonb_build_object('status','held','reason','missing_customer_id');
 end if;
 select * into v_activation from public.pj_legacy_loyalty_activation
  where singleton=true for share;
 if not found or not v_activation.transfers_enabled
  or v_activation.snapshot_id is null then
  return jsonb_build_object('status','disabled');
 end if;
 if not exists(select 1 from public.pj_legacy_loyalty_snapshots s
   where s.id=v_activation.snapshot_id and s.state='sealed'
     and s.accounts_complete) then
  return jsonb_build_object('status','held','reason','cohort_not_sealed');
 end if;
 -- The member classification reuses the existing Phase 1 accepted Square ID.
 -- It fails closed for shared IDs, unresolved state and unmatched customers.
 v_cohort:=public.pj_legacy_loyalty_classify(p_customer_id);
 if v_cohort->>'status' is distinct from 'legacy_member' then
  return jsonb_build_object('status','held',
    'reason',coalesce(v_cohort->>'status','identity_unresolved'));
 end if;
 v_legacy_account:=v_cohort->>'square_loyalty_account_id';
 v_square_points:=(v_cohort->>'square_available_points')::integer;
 -- One order of locks: snapshot membership, wallet, then ledger checks.
 perform 1 from public.pj_legacy_loyalty_members
  where snapshot_id=v_activation.snapshot_id
   and square_loyalty_account_id=v_legacy_account for share;
 if not found then raise exception 'LEGACY_SOURCE_DISAPPEARED'; end if;
 -- Serialize claims per customer, including after a 0-point transfer.
 insert into public.pj_credit_wallets(customer_id,balance)
 values(p_customer_id,0) on conflict(customer_id) do nothing;
 select w.balance into v_balance from public.pj_credit_wallets w
  where w.customer_id=p_customer_id for update;
 if not found then raise exception 'LEGACY_WALLET_LOCK_FAILED'; end if;
 select c.ledger_event_id,c.customer_id,c.credits_posted
  into v_prior from public.pj_legacy_loyalty_claims c
  where c.snapshot_id=v_activation.snapshot_id
  and c.square_loyalty_account_id=v_legacy_account;
 if found then
  if v_prior.customer_id is distinct from p_customer_id then
   return jsonb_build_object('status','held','reason','already_claimed_by_other_identity');
  end if;
  return jsonb_build_object('status','already_claimed',
   'credits_posted',v_prior.credits_posted);
 end if;
 -- Never add a captured Square balance to an existing PJ credit balance
 -- or other PJ ledger activity without a separate owner-approved reconciliation.
 select count(*) into v_ledger_count from public.pj_credit_ledger
  where customer_id=p_customer_id;
 if v_balance<>0 or v_ledger_count<>0 then
  return jsonb_build_object('status','held',
   'reason','existing_pj_credit_activity_requires_reconciliation');
 end if;
 if exists(select 1 from public.pj_legacy_loyalty_claims
  where snapshot_id=v_activation.snapshot_id and customer_id=p_customer_id) then
  return jsonb_build_object('status','held','reason','different_legacy_account_already_claimed');
 end if;
 v_posted:=least(275,v_square_points);
 insert into public.pj_credit_ledger(
  customer_id,event_kind,event_key,source_purchase_id,
  requested_credits,credit_delta,balance_before,balance_after,
  rules_version,source_effective_at)
 values(
  p_customer_id,'legacy_square_transfer',
  'square_loyalty:'||v_activation.snapshot_id::text||':'||v_legacy_account,
  null,v_square_points,v_posted,0,v_posted,'4.4:legacy_cohort',
  (select s.capture_finished_at from public.pj_legacy_loyalty_snapshots s
    where s.id=v_activation.snapshot_id))
 returning id into v_event_id;
 update public.pj_credit_wallets
 set balance=v_posted,row_version=row_version+1,updated_at=now()
 where customer_id=p_customer_id;
 insert into public.pj_legacy_loyalty_claims(
  snapshot_id,square_loyalty_account_id,customer_id,ledger_event_id,
  square_available_points,credits_posted)
 values(v_activation.snapshot_id,v_legacy_account,p_customer_id,
   v_event_id,v_square_points,v_posted);
 return jsonb_build_object('status','claimed','credits_posted',v_posted,
  'excess_above_cap',v_square_points-v_posted,'ledger_event_id',v_event_id);
end $$;
revoke all on function public.pj_legacy_loyalty_claim_verified(uuid)
 from public,anon,authenticated;
grant execute on function public.pj_legacy_loyalty_claim_verified(uuid)
 to service_role;
