-- Pepper Junction Milestone badges: independent Phase 3 foundation (Dev -> Testing).
-- Counts confirmed attached HOT SAUCE / WING SAUCE units from authorized product mapping.
-- Historical uncatalogued evidence is NOT automatically inferred by text matching.
create table if not exists public.pj_milestone_qualifying_products (
  product_id uuid primary key references public.pj_products(id),
  cns_slug text not null,
  qualifying_category text not null check (qualifying_category in ('HOT SAUCE','WING SAUCE')),
  evidence_source text not null default 'cns_category' check (evidence_source = 'cns_category'),
  recorded_at timestamptz not null default now()
);
alter table public.pj_milestone_qualifying_products enable row level security;
revoke all on public.pj_milestone_qualifying_products from public,anon,authenticated;

create table if not exists public.pj_milestone_tier_awards (
 customer_id uuid not null references public.customer_profiles(id),
 threshold integer not null check (threshold in (10,25,50,100,250,500,1000)),
 awarded_at timestamptz not null default now(),
 primary key (customer_id,threshold)
);
alter table public.pj_milestone_tier_awards enable row level security;
revoke all on public.pj_milestone_tier_awards from public,anon,authenticated;

create or replace function public.pj_milestone_evaluate_customer(p_customer_id uuid)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_units numeric; v_added integer;
begin
 if p_customer_id is null or not exists(
   select 1 from public.customer_profiles
   where id=p_customer_id and account_state='verified_matched'
 ) then return 0; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_customer_id::text,10031));
 select coalesce(sum(li.quantity),0) into v_units
 from public.purchase_line_items li
 join public.purchases p on p.id=li.purchase_id
 join public.pj_milestone_qualifying_products q on q.product_id=li.product_id
 where p.customer_id=p_customer_id and p.purchase_status='completed'
 and p.import_status='attached' and li.quantity>0 and li.quantity=trunc(li.quantity);
 insert into public.pj_milestone_tier_awards(customer_id,threshold)
 select p_customer_id, t.threshold
 from (values(10),(25),(50),(100),(250),(500),(1000)) as t(threshold)
 where v_units>=t.threshold
 on conflict(customer_id,threshold) do nothing;
 get diagnostics v_added=row_count;
 return v_added;
end $$;
revoke all on function public.pj_milestone_evaluate_customer(uuid) from public,anon,authenticated;

create or replace function public.pj_milestone_on_purchase()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_customer uuid;
begin
 if tg_table_name='purchase_line_items' then
   select customer_id into v_customer from public.purchases where id=new.purchase_id;
 else
   v_customer:=new.customer_id;
 end if;
 if v_customer is not null then perform public.pj_milestone_evaluate_customer(v_customer); end if;
 return new;
end $$;
revoke all on function public.pj_milestone_on_purchase() from public,anon,authenticated;
create trigger pj_milestone_on_line_insert after insert on public.purchase_line_items
for each row execute function public.pj_milestone_on_purchase();
create trigger pj_milestone_on_purchase_attach after insert or update of customer_id,purchase_status,import_status on public.purchases
for each row execute function public.pj_milestone_on_purchase();

create or replace function public.pj_milestone_my_awards()
returns table(threshold integer) language sql stable security definer set search_path=public,pg_temp as $$
select a.threshold from public.pj_milestone_tier_awards a
join public.customer_profiles c on c.id=a.customer_id
where c.id=auth.uid() and c.account_state='verified_matched'
order by a.threshold;
$$;
revoke all on function public.pj_milestone_my_awards() from public,anon;
grant execute on function public.pj_milestone_my_awards() to authenticated;
