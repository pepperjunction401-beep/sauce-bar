-- A customer's Square identity link is sufficient to request independent history discovery,
-- even if Phase 2 imported zero CNS-mapped purchases.
create or replace function public.pj_passenger_queue_customer(p_customer_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if exists(select 1 from public.customer_profiles where id=p_customer_id and account_state='verified_matched')
 and (
  exists(select 1 from public.purchases where customer_id=p_customer_id and purchase_status='completed' and import_status='attached')
  or exists(select 1 from public.square_customer_links where customer_id=p_customer_id and (is_active=true or is_historical_alias=true))
 ) then
  insert into public.pj_passenger_history_reconciliation_queue(customer_id)
  values(p_customer_id)
  on conflict(customer_id) do update set
   requested_at=now(),completed_at=null,claimed_at=null,last_error=null;
 end if;
end $$;
revoke all on function public.pj_passenger_queue_customer(uuid) from public,anon,authenticated;
create or replace function public.pj_passenger_link_queue_trigger()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.is_active=true or new.is_historical_alias=true then
  perform public.pj_passenger_queue_customer(new.customer_id);
 end if;
 return new;
end $$;
