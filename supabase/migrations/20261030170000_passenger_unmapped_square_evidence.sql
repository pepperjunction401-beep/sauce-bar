-- Railroad-only evidence for Square purchases not imported to Phase 2.
create table if not exists public.pj_passenger_unmapped_square_evidence (
 customer_id uuid not null references public.customer_profiles(id),
 square_order_id text not null,
 square_line_uid text not null,
 square_customer_id text not null,
 square_item_name text,
 gross_line_cents bigint not null check(gross_line_cents>=0),
 merchandise_net_cents bigint not null check(merchandise_net_cents>=0),
 classification text not null check(classification in ('merchandise','shipping','tax','unknown')),
 observed_at timestamptz not null default now(),
 primary key(square_order_id,square_line_uid),
 check(merchandise_net_cents<=gross_line_cents)
);
alter table public.pj_passenger_unmapped_square_evidence enable row level security;
revoke all on public.pj_passenger_unmapped_square_evidence from public,anon,authenticated;
grant select,insert on public.pj_passenger_unmapped_square_evidence to service_role;
create trigger pj_passenger_unmapped_immutable
before update or delete on public.pj_passenger_unmapped_square_evidence
for each row execute function public.pj_passenger_evidence_immutable();
create or replace function public.pj_passenger_verified_merchandise_cents(p_customer_id uuid)
returns bigint language sql stable security definer set search_path=public,pg_temp as $$
 select case when exists(select 1 from public.customer_profiles c where c.id=p_customer_id and c.account_state='verified_matched')
 then (
  coalesce((select sum(e.merchandise_net_cents) from public.pj_passenger_merchandise_evidence e
   join public.purchases p on p.id=e.purchase_id
   where p.customer_id=p_customer_id and p.purchase_status='completed' and p.import_status='attached' and e.classification='merchandise'),0)
  +coalesce((select sum(e.merchandise_net_cents) from public.pj_passenger_unmapped_square_evidence e
   where e.customer_id=p_customer_id and e.classification='merchandise'
   and not exists(select 1 from public.purchases p where p.square_order_id=e.square_order_id and p.purchase_status='completed' and p.import_status='attached')),0)
 )::bigint else 0::bigint end;
$$;
revoke all on function public.pj_passenger_verified_merchandise_cents(uuid) from public,anon,authenticated;
grant execute on function public.pj_passenger_verified_merchandise_cents(uuid) to service_role;
-- Newly matched Square identities create a Railroad discovery request independently of purchase import.
create or replace function public.pj_passenger_link_queue_trigger()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if exists(select 1 from public.customer_profiles c where c.id=new.customer_id and c.account_state='verified_matched') then
  insert into public.pj_passenger_history_reconciliation_queue(customer_id)
  values(new.customer_id)
  on conflict(customer_id) do update set requested_at=now(),completed_at=null,claimed_at=null,last_error=null;
 end if;
 return new;
end $$;
create trigger pj_passenger_link_enqueue after insert or update of is_active,is_historical_alias
on public.square_customer_links for each row execute function public.pj_passenger_link_queue_trigger();
