-- Independent final activation for the Loyalty Bridge display and token exchange.
-- OFF by default. No other badge families, Railroad, checkout or purchase paths touched.
create table public.pj_loyalty_bridge_activation (
 singleton boolean primary key default true check(singleton),
 display_enabled boolean not null default false,
 exchange_enabled boolean not null default false,
 updated_at timestamptz not null default now(),
 check(not exchange_enabled or display_enabled)
);
insert into public.pj_loyalty_bridge_activation(singleton) values(true);
alter table public.pj_loyalty_bridge_activation enable row level security;
revoke all on public.pj_loyalty_bridge_activation from public,anon,authenticated,service_role;
grant select,update on public.pj_loyalty_bridge_activation to service_role;

-- Read-only exchange quote. No token exchange, cart, order or wallet writes.
-- A spending command must be separately authorized and tied to authoritative
-- reward fulfillment/paid order context. Do not invent provisional reservations.
create function public.pj_loyalty_my_exchange_quote(p_token_number integer)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,auth,pg_temp as $$
declare
 v_customer uuid := auth.uid();
 v_state record;
 v_token record;
 v_balance integer;
begin
 if v_customer is null then
  raise exception 'PJ_LOYALTY_SIGNIN_REQUIRED' using errcode='28000';
 end if;
 if not exists(select 1 from public.customer_profiles c
   where c.id=v_customer and c.account_state='verified_matched') then
  return jsonb_build_object('status','identity_not_verified',
    'exchange_possible',false);
 end if;
 select display_enabled,exchange_enabled into v_state
 from public.pj_loyalty_bridge_activation where singleton=true;
 if not found or not v_state.display_enabled or not v_state.exchange_enabled then
  return jsonb_build_object('status','exchange_not_launched',
   'exchange_possible',false);
 end if;
 if not exists(
   select 1 from public.pj_legacy_loyalty_activation a
   join public.pj_legacy_loyalty_snapshots s on s.id=a.snapshot_id
   where a.singleton=true and s.state='sealed' and s.accounts_complete
   and a.transfers_enabled and a.nonmember_history_enabled
   and a.history_cutoff_at is not null
 ) then
   return jsonb_build_object('status','historical_cutover_unverified',
     'exchange_possible',false);
 end if;
 select token_number,tier_cost,reward_kind,reward_product_slug,discount_percent
 into v_token from public.pj_loyalty_token_definitions
 where token_number=p_token_number;
 if not found then return jsonb_build_object('status','unknown_token',
   'exchange_possible',false); end if;
 select coalesce(w.balance,0) into v_balance
 from public.customer_profiles c
 left join public.pj_credit_wallets w on w.customer_id=c.id
 where c.id=v_customer;
 if not found then return jsonb_build_object('status','wallet_unavailable',
    'exchange_possible',false);end if;
 return jsonb_build_object(
  'status',case when v_balance>=v_token.tier_cost then 'qualifies' else 'insufficient_credits' end,
  'exchange_possible',false,
  'token_number',v_token.token_number,
  'tier_cost',v_token.tier_cost,
  'current_credits',v_balance,
  'reward_kind',v_token.reward_kind,
  'reward_product_slug',v_token.reward_product_slug,
  'discount_percent',v_token.discount_percent,
  'one_token_per_transaction',true,
  'note','Quote only: no reward issued and no credits debited');
end $$;
revoke all on function public.pj_loyalty_my_exchange_quote(integer)
 from public,anon,authenticated,service_role;
grant execute on function public.pj_loyalty_my_exchange_quote(integer) to authenticated;


-- Pepper Junction Phase 4 read-only presentation of Phase 3 Loyalty Bridge state.
-- Uses existing verified customer identity via auth.uid(). No owner-controlled
-- account ID can be supplied by a client. Never writes credits or exchanges.
-- All 15 tokens are returned in fixed owner-approved order with only
-- current wallet balance qualification (exchange handling is not active).
create or replace function public.pj_loyalty_my_collection()
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_customer uuid := auth.uid();
  v_verified boolean := false;
  v_balance integer;
  v_tokens jsonb;
begin
  if v_customer is null then
    raise exception 'PJ_LOYALTY_AUTH_REQUIRED' using errcode = '28000';
  end if;
  select exists(
    select 1 from public.customer_profiles c
    where c.id=v_customer and c.account_state='verified_matched'
  ) into v_verified;
  if not v_verified then
    return jsonb_build_object('status','identity_not_verified');
  end if;

  -- Lock the entire Loyalty Bridge collection until the owner explicitly
  -- approves the coordinated launch following Square account recovery.
  if not exists(
    select 1 from public.pj_loyalty_bridge_activation a
    where a.singleton=true and a.display_enabled=true
  ) then
    return jsonb_build_object('status','prelaunch_locked',
      'balance',null,'ceiling',275,'tokens','[]'::jsonb);
  end if;

  select coalesce(w.balance,0) into v_balance
  from public.customer_profiles c
  left join public.pj_credit_wallets w on w.customer_id=c.id
  where c.id=v_customer;
  if v_balance is null then
    raise exception 'PJ_LOYALTY_WALLET_STATE_UNAVAILABLE';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object('token_number',d.token_number,
                       'balance_qualified',(v_balance>=d.tier_cost))
    order by d.token_number
  ),'[]'::jsonb) into v_tokens
  from public.pj_loyalty_token_definitions d;

  return jsonb_build_object('status','verified',
    'balance',v_balance,'ceiling',275,'tokens',v_tokens);
end;
$$;
revoke all on function public.pj_loyalty_my_collection() from public,anon,authenticated,service_role;
grant execute on function public.pj_loyalty_my_collection() to authenticated;
