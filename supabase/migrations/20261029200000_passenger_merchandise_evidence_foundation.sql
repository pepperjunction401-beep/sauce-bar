-- Railroad Passenger Class: independent Square merchandise evidence (Stage 2).
-- Does not alter purchases, CNS mapping, or any existing badge family.
-- Only verified Square line evidence may be inserted server-side.
create table if not exists public.pj_passenger_merchandise_evidence (
  purchase_id uuid not null references public.purchases(id) on delete restrict,
  square_line_uid text not null check (length(square_line_uid) between 1 and 200),
  square_catalog_object_id text,
  square_item_name text,
  classification text not null check (classification in ('merchandise','shipping','tax','unknown')),
  quantity numeric(14,3) check (quantity > 0),
  gross_line_cents bigint not null check (gross_line_cents >= 0),
  merchandise_net_cents bigint not null check (merchandise_net_cents >= 0),
  evidence_source text not null check (evidence_source in ('square_order_line','owner_verified_historical')),
  recorded_at timestamptz not null default now(),
  primary key (purchase_id,square_line_uid),
  check (merchandise_net_cents <= gross_line_cents),
  check (classification='merchandise' or merchandise_net_cents=0)
);
create index if not exists pj_passenger_merchandise_by_purchase
on public.pj_passenger_merchandise_evidence(purchase_id);
alter table public.pj_passenger_merchandise_evidence enable row level security;
revoke all on public.pj_passenger_merchandise_evidence from public,anon,authenticated;
grant select,insert on public.pj_passenger_merchandise_evidence to service_role;

-- Evidence is append-only; an existing Square line cannot be silently rewritten.
create or replace function public.pj_passenger_evidence_immutable()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  raise exception 'PASSENGER_EVIDENCE_IMMUTABLE';
end $$;
drop trigger if exists pj_passenger_evidence_no_mutate on public.pj_passenger_merchandise_evidence;
create trigger pj_passenger_evidence_no_mutate before update or delete
on public.pj_passenger_merchandise_evidence for each row
execute function public.pj_passenger_evidence_immutable();
revoke all on function public.pj_passenger_evidence_immutable() from public,anon,authenticated;

-- Server-side per-customer merchandise subtotal; no confidential token thresholds.
-- Only attached, completed purchases attached to verified customer accounts count.
-- Unclassified lines never contribute to the total.
create or replace function public.pj_passenger_verified_merchandise_cents(p_customer_id uuid)
returns bigint language sql stable security definer
set search_path=public,pg_temp as $$
 select coalesce(sum(e.merchandise_net_cents),0)::bigint
 from public.pj_passenger_merchandise_evidence e
 join public.purchases p on p.id=e.purchase_id
 join public.customer_profiles c on c.id=p.customer_id
 where p.customer_id=p_customer_id
   and c.account_state='verified_matched'
   and p.purchase_status='completed'
   and p.import_status='attached'
   and e.classification='merchandise';
$$;
revoke all on function public.pj_passenger_verified_merchandise_cents(uuid) from public,anon,authenticated;
grant execute on function public.pj_passenger_verified_merchandise_cents(uuid) to service_role;
