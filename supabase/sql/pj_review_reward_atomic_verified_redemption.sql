-- Supabase Testing ONLY: atomic finalization of a Square-sandbox VERIFIED order.
-- Not a public RPC. Caller must independently verify Square payment evidence and reward line
-- before invoking. This function never trusts a browser assertion that an order is paid.
create function public.pj_review_reward_finalize_verified_order(
  p_customer_id uuid, p_row_number integer, p_square_order_id text
) returns boolean language plpgsql security invoker set search_path to ''
as $body$
declare v_product uuid; v_attempt uuid; v_row_count integer;
begin
  if p_customer_id is null or p_row_number < 1
    or nullif(btrim(p_square_order_id),'') is null then
    raise exception 'INVALID_REWARD_CONFIRMATION';
  end if;
  -- One row locked for concurrent replay protection.
  select e.selected_product_id into v_product
  from public.pj_review_reward_entitlements e
  where e.customer_id=p_customer_id and e.row_number=p_row_number
  for update;
  if not found then raise exception 'ENTITLEMENT_NOT_FOUND'; end if;
  if exists (
    select 1 from public.pj_review_reward_entitlements e
    where e.customer_id=p_customer_id and e.row_number=p_row_number
      and e.status='redeemed' and e.redeemed_square_order_id=p_square_order_id
  ) then return true; end if;

  select a.id into v_attempt from public.pj_review_reward_checkout_attempts a
  where a.customer_id=p_customer_id and a.row_number=p_row_number
    and a.selected_product_id=v_product and a.square_order_id=p_square_order_id
    and a.state='opened' for update;
  if not found then raise exception 'REWARD_CHECKOUT_ATTEMPT_NOT_ELIGIBLE'; end if;

  update public.pj_review_reward_entitlements e
  set status='redeemed',redeemed_square_order_id=p_square_order_id,redeemed_at=now()
  where e.customer_id=p_customer_id and e.row_number=p_row_number
    and e.status='selected' and e.selected_product_id=v_product;
  get diagnostics v_row_count=row_count;
  if v_row_count <> 1 then raise exception 'REWARD_ALREADY_CONSUMED'; end if;

  update public.pj_review_reward_checkout_attempts a
  set state='paid_verified',verified_at=now(),last_checked_at=now()
  where a.id=v_attempt and a.state='opened';
  get diagnostics v_row_count=row_count;
  if v_row_count <> 1 then raise exception 'ATTEMPT_REPLAY_CONFLICT'; end if;
  return true;
end
$body$;
revoke all on function public.pj_review_reward_finalize_verified_order(uuid,integer,text)
  from public,anon,authenticated;
grant execute on function public.pj_review_reward_finalize_verified_order(uuid,integer,text)
  to service_role;
grant update (status,redeemed_square_order_id,redeemed_at)
  on public.pj_review_reward_entitlements to service_role;
