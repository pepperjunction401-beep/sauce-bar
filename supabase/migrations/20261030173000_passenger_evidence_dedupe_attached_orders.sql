-- Count independent Square lines only when that exact line has not already
-- been recorded in the attached purchase's Railroad evidence ledger.
-- Allows discontinued items inside a partially mapped order (e.g. Blues Hog).
create or replace function public.pj_passenger_verified_merchandise_cents(p_customer_id uuid)
returns bigint language sql stable security definer set search_path=public,pg_temp as $$
 select case when exists(select 1 from public.customer_profiles c
  where c.id=p_customer_id and c.account_state='verified_matched')
 then (
  coalesce((select sum(e.merchandise_net_cents) from public.pj_passenger_merchandise_evidence e
   join public.purchases p on p.id=e.purchase_id
   where p.customer_id=p_customer_id and p.purchase_status='completed'
    and p.import_status='attached' and e.classification='merchandise'),0)
  +
  coalesce((select sum(e.merchandise_net_cents)
   from public.pj_passenger_unmapped_square_evidence e
   where e.customer_id=p_customer_id and e.classification='merchandise'
    and not exists (
      select 1 from public.purchases p
      join public.pj_passenger_merchandise_evidence x on x.purchase_id=p.id
      where p.square_order_id=e.square_order_id
       and p.customer_id=p_customer_id and p.purchase_status='completed'
       and p.import_status='attached' and x.square_line_uid=e.square_line_uid
    )
  ),0)
 )::bigint else 0::bigint end;
$$;
revoke all on function public.pj_passenger_verified_merchandise_cents(uuid) from public,anon,authenticated;
grant execute on function public.pj_passenger_verified_merchandise_cents(uuid) to service_role;
