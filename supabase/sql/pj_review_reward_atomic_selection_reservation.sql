-- Review Board reward atomic selection and checkout reservation, Testing only.
-- Prevents TOCTOU race between switching a selected reward and creating its payment link.
create function public.pj_review_reward_select_when_idle(
  p_customer_id uuid,p_row_number integer,p_product_id uuid
) returns boolean language plpgsql security invoker set search_path to ''
as $fn$
declare v_state text;
begin
 if p_customer_id is null or p_row_number<1 or p_product_id is null then
  raise exception 'INVALID_REWARD_SELECTION';
 end if;
 select status into v_state from public.pj_review_reward_entitlements
 where customer_id=p_customer_id and row_number=p_row_number for update;
 if not found or v_state not in ('available','selected') then
  raise exception 'REWARD_NOT_AVAILABLE';
 end if;
 if not exists(
  select 1 from public.pj_review_board_slots where row_number=p_row_number and product_id=p_product_id
 ) then raise exception 'REWARD_NOT_IN_ROW'; end if;
 if exists(
  select 1 from public.pj_review_reward_checkout_attempts
  where customer_id=p_customer_id and row_number=p_row_number and state in ('creating','opened')
 ) then raise exception 'REWARD_CHECKOUT_IN_PROGRESS'; end if;
 update public.pj_review_reward_entitlements
 set status='selected',selected_product_id=p_product_id,selected_at=now()
 where customer_id=p_customer_id and row_number=p_row_number;
 return true;
end
$fn$;

create function public.pj_review_reward_reserve_checkout(
  p_customer_id uuid,p_row_number integer,p_expected_product_id uuid,p_request_id text
) returns uuid language plpgsql security invoker set search_path to ''
as $fn$
declare v_product uuid; v_status text; v_id uuid;
begin
 if p_customer_id is null or p_row_number<1 or p_expected_product_id is null
    or p_request_id !~ '^[A-Za-z0-9-]{8,100}$' then
  raise exception 'INVALID_REWARD_CHECKOUT_REQUEST';
 end if;
 select status,selected_product_id into v_status,v_product
 from public.pj_review_reward_entitlements
 where customer_id=p_customer_id and row_number=p_row_number for update;
 if not found or v_status<>'selected' or v_product is distinct from p_expected_product_id then
  raise exception 'REWARD_SELECTION_CHANGED';
 end if;
 insert into public.pj_review_reward_checkout_attempts
  (customer_id,row_number,selected_product_id,checkout_request_id)
 values(p_customer_id,p_row_number,v_product,p_request_id)
 returning id into v_id;
 return v_id;
end
$fn$;

revoke all on function public.pj_review_reward_select_when_idle(uuid,integer,uuid)
 from public,anon,authenticated;
revoke all on function public.pj_review_reward_reserve_checkout(uuid,integer,uuid,text)
 from public,anon,authenticated;
grant execute on function public.pj_review_reward_select_when_idle(uuid,integer,uuid)
 to service_role;
grant execute on function public.pj_review_reward_reserve_checkout(uuid,integer,uuid,text)
 to service_role;