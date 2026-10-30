-- Railroad-owned recovery queue: no changes to Phase 2 importer.
create table if not exists public.pj_passenger_history_reconciliation_queue (
 customer_id uuid primary key references public.customer_profiles(id) on delete cascade,
 requested_at timestamptz not null default now(),
 claimed_at timestamptz,
 completed_at timestamptz,
 attempts integer not null default 0,
 last_error text
);
alter table public.pj_passenger_history_reconciliation_queue enable row level security;
revoke all on public.pj_passenger_history_reconciliation_queue from public, anon, authenticated;
grant select,insert,update on public.pj_passenger_history_reconciliation_queue to service_role;
create or replace function public.pj_passenger_queue_customer(p_customer_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if exists (select 1 from public.customer_profiles where id=p_customer_id and account_state='verified_matched')
 and exists (select 1 from public.purchases where customer_id=p_customer_id and purchase_status='completed' and import_status='attached') then
  insert into public.pj_passenger_history_reconciliation_queue(customer_id)
  values(p_customer_id)
  on conflict(customer_id) do update set
   requested_at=now(),completed_at=null,claimed_at=null,last_error=null;
 end if;
end $$;
revoke all on function public.pj_passenger_queue_customer(uuid) from public,anon,authenticated;
create or replace function public.pj_passenger_purchase_queue_trigger()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.customer_id is not null and new.purchase_status='completed' and new.import_status='attached' then
  perform public.pj_passenger_queue_customer(new.customer_id);
 end if;
 return new;
end $$;
drop trigger if exists pj_passenger_purchase_enqueue on public.purchases;
create trigger pj_passenger_purchase_enqueue after insert or update of customer_id,purchase_status,import_status
on public.purchases for each row execute function public.pj_passenger_purchase_queue_trigger();
create or replace function public.pj_passenger_profile_queue_trigger()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.account_state='verified_matched' and (tg_op='INSERT' or old.account_state is distinct from new.account_state) then
  perform public.pj_passenger_queue_customer(new.id);
 end if;
 return new;
end $$;
drop trigger if exists pj_passenger_profile_enqueue on public.customer_profiles;
create trigger pj_passenger_profile_enqueue after insert or update of account_state
on public.customer_profiles for each row execute function public.pj_passenger_profile_queue_trigger();
-- Queue already-verified customers whose purchases predate this migration.
insert into public.pj_passenger_history_reconciliation_queue(customer_id)
select distinct p.customer_id from public.purchases p
join public.customer_profiles c on c.id=p.customer_id
where c.account_state='verified_matched' and p.purchase_status='completed' and p.import_status='attached'
on conflict(customer_id) do nothing;
