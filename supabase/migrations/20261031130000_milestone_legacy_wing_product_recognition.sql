-- Milestone: owner-confirmed pre-CNS Wing Sauce brands, sourced only from
-- completed, attached Square purchases in the existing Railroad evidence table.
-- Product name classification is NOT a generic "contains hot sauce" shortcut.
create table if not exists public.pj_milestone_legacy_name_rules (
  phrase text primary key,
  qualifying_category text not null check (qualifying_category in ('HOT SAUCE','WING SAUCE')),
  attribution text not null default 'owner_confirmed',
  recorded_at timestamptz not null default now()
);
alter table public.pj_milestone_legacy_name_rules enable row level security;
revoke all on public.pj_milestone_legacy_name_rules from public,anon,authenticated;
insert into public.pj_milestone_legacy_name_rules(phrase,qualifying_category)
values ('defcon','WING SAUCE'),('the flaming chicken','WING SAUCE')
on conflict(phrase) do update set qualifying_category=excluded.qualifying_category;

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
   -- The catalog classification governs normally attached purchase lines.
   select li.quantity
   from public.purchase_line_items li
   join public.purchases p on p.id=li.purchase_id
   join public.pj_milestone_qualifying_products q on q.product_id=li.product_id
   where p.customer_id=p_customer_id and p.purchase_status='completed'
     and p.import_status='attached' and li.quantity>0 and li.quantity=trunc(li.quantity)
   union all
   -- Legacy brand names govern only Square-evidenced, nonduplicated historical lines.
   select e.quantity
   from public.pj_passenger_merchandise_evidence e
   join public.purchases p on p.id=e.purchase_id
   where p.customer_id=p_customer_id and p.purchase_status='completed'
     and p.import_status='attached'
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

create or replace function public.pj_milestone_on_legacy_evidence()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_customer uuid;
begin
 select customer_id into v_customer from public.purchases where id=new.purchase_id;
 if v_customer is not null then perform public.pj_milestone_evaluate_customer(v_customer); end if;
 return new;
end $$;
revoke all on function public.pj_milestone_on_legacy_evidence() from public,anon,authenticated;
create trigger pj_milestone_on_legacy_evidence_insert
after insert on public.pj_passenger_merchandise_evidence
for each row execute function public.pj_milestone_on_legacy_evidence();
