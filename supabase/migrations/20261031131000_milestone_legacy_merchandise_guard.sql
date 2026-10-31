-- Historical Milestone units must be verified merchandise, never shipping/tax/unknown.
create or replace function public.pj_milestone_evaluate_customer(p_customer_id uuid)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_units numeric; v_added integer;
begin
 if p_customer_id is null or not exists(
   select 1 from public.customer_profiles
   where id=p_customer_id and account_state='verified_matched'
 ) then return 0; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_customer_id::text,10031));
 with qualifying_lines as (
   select li.quantity
   from public.purchase_line_items li
   join public.purchases p on p.id=li.purchase_id
   join public.pj_milestone_qualifying_products q on q.product_id=li.product_id
   where p.customer_id=p_customer_id and p.purchase_status='completed'
     and p.import_status='attached' and li.quantity>0 and li.quantity=trunc(li.quantity)
   union all
   select e.quantity
   from public.pj_passenger_merchandise_evidence e
   join public.purchases p on p.id=e.purchase_id
   where p.customer_id=p_customer_id and p.purchase_status='completed'
     and p.import_status='attached'
     and e.classification='merchandise'
     and e.square_line_uid is not null and btrim(e.square_line_uid)<>''
     and e.quantity>0 and e.quantity=trunc(e.quantity)
     and exists (
       select 1 from public.pj_milestone_legacy_name_rules r
       where lower(coalesce(e.square_item_name,'')) ~
         ('(^|[^[:alnum:]])'||replace(r.phrase,' ','[[:space:]]+')||'([^[:alnum:]]|$)')
     )
     and not exists (
       select 1 from public.purchase_line_items li
       where li.purchase_id=e.purchase_id
         and li.square_line_item_uid=e.square_line_uid
     )
 )
 select coalesce(sum(quantity),0) into v_units from qualifying_lines;
 insert into public.pj_milestone_tier_awards(customer_id,threshold)
 select p_customer_id,t.threshold from (values(10),(25),(50),(100),(250),(500),(1000)) t(threshold)
 where v_units>=t.threshold
 on conflict(customer_id,threshold) do nothing;
 get diagnostics v_added=row_count;
 return v_added;
end $$;
revoke all on function public.pj_milestone_evaluate_customer(uuid) from public,anon,authenticated;
