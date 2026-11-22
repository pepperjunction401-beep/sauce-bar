-- Loyalty Bridge: server-owned Square order evidence, never a credit reservation.
-- No wallet or ledger mutation occurs in these checkout registration functions.
create table public.pj_loyalty_order_bindings (
  checkout_request_id text primary key check (checkout_request_id ~ '^[A-Za-z0-9-]{8,80}$'),
  customer_id uuid not null references public.customer_profiles(id) on delete restrict,
  token_number smallint not null references public.pj_loyalty_token_definitions(token_number) on delete restrict,
  tier_cost smallint not null check (tier_cost between 50 and 225),
  reward_kind text not null,
  reward_product_slug text,
  discount_percent smallint,
  expected_pricing jsonb not null check (jsonb_typeof(expected_pricing)='object'),
  reward_variation_id text,
  square_order_id text unique,
  square_payment_link_id text unique,
  state text not null default 'creating' check (state in ('creating','opened','paid_verified','voided')),
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  verified_at timestamptz,
  constraint pj_loyalty_binding_reward_shape check (
    (reward_kind='product' and reward_product_slug is not null and discount_percent is null and reward_variation_id is not null)
    or (reward_kind='discount' and reward_product_slug is null and discount_percent in (10,15,20) and reward_variation_id is null)
  ),
  constraint pj_loyalty_binding_open_shape check (
    state not in ('opened','paid_verified') or
    (nullif(btrim(square_order_id),'') is not null and nullif(btrim(square_payment_link_id),'') is not null and opened_at is not null)
  ),
  constraint pj_loyalty_binding_paid_shape check (state <> 'paid_verified' or verified_at is not null)
);
-- Multiple simultaneously payable links must never spend the same balance.
-- This gates link creation only: no credits are held, spent, or removed.
-- A later server-only cancellation path must verify the old link can no
-- longer be paid before voiding it. No client-side cancellation or timeout.
create unique index pj_loyalty_one_payable_link
  on public.pj_loyalty_order_bindings(customer_id)
  where state in ('creating','opened');
alter table public.pj_loyalty_order_bindings enable row level security;
revoke all on public.pj_loyalty_order_bindings from public, anon, authenticated;
grant select, insert, update on public.pj_loyalty_order_bindings to service_role;

create function public.pj_loyalty_begin_order_binding(
 p_customer_id uuid, p_token_number integer, p_request_id text,
 p_expected_pricing jsonb, p_reward_variation_id text
) returns jsonb
language plpgsql
set search_path = ''
as $function$
declare t record; b integer;
begin
 if p_customer_id is null or p_token_number is null or
    p_request_id is null or p_request_id !~ '^[A-Za-z0-9-]{8,80}$' or
    p_expected_pricing is null or jsonb_typeof(p_expected_pricing) <> 'object' or
    jsonb_typeof(p_expected_pricing->'line_items') is distinct from 'array' or
    jsonb_typeof(p_expected_pricing->'discounts') is distinct from 'array'
 then return jsonb_build_object('status','invalid_binding','accepted',false); end if;
 if jsonb_array_length(p_expected_pricing->'line_items') < 1 or
    jsonb_array_length(p_expected_pricing->'discounts') <> 1
 then return jsonb_build_object('status','invalid_binding','accepted',false); end if;
 perform 1 from public.pj_loyalty_bridge_activation a
   where a.singleton and a.display_enabled and a.exchange_enabled for share;
 if not found then return jsonb_build_object('status','exchange_not_launched','accepted',false); end if;
 perform 1 from public.pj_legacy_loyalty_activation a
   join public.pj_legacy_loyalty_snapshots s on s.id=a.snapshot_id
   where a.singleton and s.state='sealed' and s.accounts_complete
   and a.transfers_enabled and a.nonmember_history_enabled and a.history_cutoff_at is not null;
 if not found then return jsonb_build_object('status','historical_cutover_unverified','accepted',false); end if;
 if not exists(select 1 from public.customer_profiles c
   where c.id=p_customer_id and c.account_state='verified_matched')
   or not exists(select 1 from public.square_customer_links l
   where l.customer_id=p_customer_id and l.is_active)
 then return jsonb_build_object('status','identity_not_verified','accepted',false); end if;
 select d.token_number,d.tier_cost,d.reward_kind,d.reward_product_slug,d.discount_percent
 into t from public.pj_loyalty_token_definitions d where d.token_number=p_token_number;
 if not found then return jsonb_build_object('status','unknown_token','accepted',false); end if;
 if (t.reward_kind='product' and nullif(btrim(p_reward_variation_id),'') is null)
    or (t.reward_kind='discount' and p_reward_variation_id is not null)
 then return jsonb_build_object('status','invalid_reward_mapping','accepted',false); end if;
 select w.balance into b from public.pj_credit_wallets w where w.customer_id=p_customer_id;
 if not found or b < t.tier_cost
 then return jsonb_build_object('status','insufficient_credits','accepted',false); end if;
 insert into public.pj_loyalty_order_bindings(
   checkout_request_id,customer_id,token_number,tier_cost,reward_kind,reward_product_slug,
   discount_percent,expected_pricing,reward_variation_id
 ) values (p_request_id,p_customer_id,t.token_number,t.tier_cost,t.reward_kind,t.reward_product_slug,
   t.discount_percent,p_expected_pricing,p_reward_variation_id)
 on conflict do nothing;
 if not found then return jsonb_build_object('status','checkout_already_pending','accepted',false); end if;
 return jsonb_build_object('status','registered','accepted',true);
end
$function$;

create function public.pj_loyalty_bind_square_order(
 p_request_id text,p_customer_id uuid,p_square_order_id text,p_square_payment_link_id text
) returns boolean
language plpgsql
set search_path = ''
as $function$
begin
 if p_request_id is null or p_customer_id is null
    or nullif(btrim(p_square_order_id),'') is null
    or nullif(btrim(p_square_payment_link_id),'') is null
 then return false; end if;
 update public.pj_loyalty_order_bindings
   set square_order_id=p_square_order_id,square_payment_link_id=p_square_payment_link_id,
       state='opened',opened_at=now()
 where checkout_request_id=p_request_id and customer_id=p_customer_id and state='creating';
 if found then return true; end if;
 return exists(select 1 from public.pj_loyalty_order_bindings
   where checkout_request_id=p_request_id and customer_id=p_customer_id and state='opened'
   and square_order_id=p_square_order_id and square_payment_link_id=p_square_payment_link_id);
end
$function$;

revoke all on function public.pj_loyalty_begin_order_binding(uuid,integer,text,jsonb,text) from public,anon,authenticated;
revoke all on function public.pj_loyalty_bind_square_order(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.pj_loyalty_begin_order_binding(uuid,integer,text,jsonb,text) to service_role;
grant execute on function public.pj_loyalty_bind_square_order(text,uuid,text,text) to service_role;
