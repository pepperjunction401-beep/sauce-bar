-- Pepper Junction Phase 4 read-only presentation of Phase 3 Loyalty Bridge state.
-- Uses existing verified customer identity via auth.uid(). No owner-controlled
-- account ID can be supplied by a client. Never writes credits or exchanges.
-- All 15 tokens are returned in fixed owner-approved order with only
-- current wallet balance qualification (exchange handling is not active).
create function public.pj_loyalty_my_collection()
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
