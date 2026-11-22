-- Pepper Junction Loyalty Bridge / secure paid exchange settlement.
-- Dev/Testing first. No checkout reservation, payment alteration or reward-delivery call.
create table if not exists public.pj_loyalty_exchanges (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references public.customer_profiles(id) on delete restrict,
 source_purchase_id uuid not null unique references public.purchases(id) on delete restrict,
 token_number smallint not null references public.pj_loyalty_token_definitions(token_number),
 tier_cost smallint not null check (tier_cost between 50 and 225),
 reward_kind text not null check (reward_kind in ('product','discount')),
 reward_product_slug text,
 discount_percent smallint,
 balance_before integer not null check (balance_before between 0 and 275),
 balance_after integer not null check (balance_after between 0 and 275),
 ledger_id uuid not null unique references public.pj_credit_ledger(id) on delete restrict,
 delivery_state text not null default 'awaiting_integration' check (delivery_state = 'awaiting_integration'),
 created_at timestamptz not null default now(),
 constraint pj_loyalty_exchange_math check (balance_after=balance_before-tier_cost),
 constraint pj_loyalty_exchange_reward_shape check (
 (reward_kind='product' and reward_product_slug is not null and discount_percent is null)
 or (reward_kind='discount' and discount_percent in (10,15,20) and reward_product_slug is null))
);
alter table public.pj_loyalty_exchanges enable row level security;
revoke all on public.pj_loyalty_exchanges from public, anon, authenticated;
grant select, insert on public.pj_loyalty_exchanges to service_role;
create unique index if not exists pj_loyalty_ledger_one_exchange_per_purchase
 on public.pj_credit_ledger(source_purchase_id) where event_kind='loyalty_exchange';

CREATE OR REPLACE FUNCTION public.pj_loyalty_commit_paid_exchange(p_purchase_id uuid, p_token_number integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
 v_p record;
 v_token record;
 v_balance integer;
 v_exchange record;
 v_ledger_id uuid;
 v_after integer;
begin
 if p_purchase_id is null or p_token_number is null then
   return jsonb_build_object('status','missing_input','committed',false);
 end if;
 -- Lock switch row, and do not proceed without the fully authorized cohort cutover.
 perform 1 from public.pj_loyalty_bridge_activation a
  where a.singleton and a.display_enabled and a.exchange_enabled for share;
 if not found then
  return jsonb_build_object('status','exchange_not_launched','committed',false);
 end if;
 perform 1 from public.pj_legacy_loyalty_activation a
  join public.pj_legacy_loyalty_snapshots s on s.id=a.snapshot_id
  where a.singleton and s.state='sealed' and s.accounts_complete
  and a.transfers_enabled and a.nonmember_history_enabled
  and a.history_cutoff_at is not null;
 if not found then
  return jsonb_build_object('status','historical_cutover_unverified','committed',false);
 end if;
 select p.id,p.customer_id,p.purchase_status,p.import_status,p.source_channel,
  p.square_customer_id,p.square_payment_id,p.square_order_id,p.completed_at,
  c.account_state
  into v_p from public.purchases p
  join public.customer_profiles c on c.id=p.customer_id
  where p.id=p_purchase_id for share of p;
 if not found then
  return jsonb_build_object('status','purchase_not_found','committed',false);
 end if;
 if v_p.account_state <> 'verified_matched'
  or v_p.purchase_status <> 'completed'
  or v_p.import_status <> 'attached'
  or v_p.completed_at is null
  or v_p.source_channel not in ('webhook','signed_in_checkout')
  or (v_p.square_payment_id is null and v_p.square_order_id is null)
  or v_p.square_customer_id is null
  or not exists (
   select 1 from public.square_customer_links l
   where l.customer_id=v_p.customer_id
    and l.square_customer_id=v_p.square_customer_id
    and (l.is_active or l.is_historical_alias)
  )
 then
  return jsonb_build_object('status','unverified_paid_transaction','committed',false);
 end if;
 -- Match current canonical registry rather than accepting browser-supplied cost.
 select d.token_number,d.tier_cost,d.reward_kind,d.reward_product_slug,d.discount_percent
  into v_token from public.pj_loyalty_token_definitions d
  where d.token_number=p_token_number;
 if not found then
  return jsonb_build_object('status','unknown_token','committed',false);
 end if;
 -- The existing earning path uses this same wallet row lock; serialize with it.
 select w.balance into v_balance from public.pj_credit_wallets w
  where w.customer_id=v_p.customer_id for update;
 if not found then
  return jsonb_build_object('status','wallet_not_found','committed',false);
 end if;
 select e.id,e.token_number,e.balance_after into v_exchange
  from public.pj_loyalty_exchanges e
  where e.source_purchase_id=p_purchase_id;
 if found then
  if v_exchange.token_number=p_token_number then
   return jsonb_build_object('status','already_committed','committed',true,
    'exchange_id',v_exchange.id,'balance_after',v_exchange.balance_after);
  end if;
  return jsonb_build_object('status','transaction_already_used','committed',false);
 end if;
 if exists(select 1 from public.pj_credit_ledger l
  where l.event_kind='loyalty_exchange' and l.source_purchase_id=p_purchase_id) then
  return jsonb_build_object('status','transaction_already_used','committed',false);
 end if;
 if v_balance<v_token.tier_cost then
  return jsonb_build_object('status','insufficient_credits','committed',false,
   'current_credits',v_balance,'required_credits',v_token.tier_cost);
 end if;
 v_after:=v_balance-v_token.tier_cost;
 -- Atomic immutable debit, wallet update and delivery obligation. Any error rolls all back.
 insert into public.pj_credit_ledger(
   customer_id,event_kind,event_key,source_purchase_id,requested_credits,
   credit_delta,balance_before,balance_after,rules_version,source_effective_at
 ) values (
   v_p.customer_id,'loyalty_exchange','loyalty_paid_exchange:'||p_purchase_id::text,
   p_purchase_id,null,-v_token.tier_cost,v_balance,v_after,'4.4',v_p.completed_at
 ) returning id into v_ledger_id;
 update public.pj_credit_wallets
  set balance=v_after,row_version=row_version+1,updated_at=now()
  where customer_id=v_p.customer_id;
 insert into public.pj_loyalty_exchanges(
   customer_id,source_purchase_id,token_number,tier_cost,reward_kind,
   reward_product_slug,discount_percent,balance_before,balance_after,ledger_id
 ) values (
   v_p.customer_id,p_purchase_id,v_token.token_number,v_token.tier_cost,
   v_token.reward_kind,v_token.reward_product_slug,v_token.discount_percent,
   v_balance,v_after,v_ledger_id
 ) returning id into v_exchange;
 return jsonb_build_object('status','committed_pending_delivery','committed',true,
   'exchange_id',v_exchange.id,'token_number',v_token.token_number,
   'credits_spent',v_token.tier_cost,'balance_after',v_after,
   'delivery_state','awaiting_integration');
end
$function$
;
revoke all on function public.pj_loyalty_commit_paid_exchange(uuid,integer) from public,anon,authenticated;
grant execute on function public.pj_loyalty_commit_paid_exchange(uuid,integer) to service_role;
