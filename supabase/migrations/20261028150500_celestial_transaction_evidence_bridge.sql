-- Celestial transaction bridge. Existing Phase 2 records remain immutable.
-- Timezone evidence is server-only; a browser hint is not itself purchase ownership.
create table if not exists public.pj_celestial_purchase_timezones (
  purchase_id uuid primary key references public.purchases(id) on delete cascade,
  timezone_name text not null,
  evidence_source text not null check (evidence_source in ('checkout_captured','owner_verified_historical')),
  recorded_at timestamptz not null default now(),
  check (length(timezone_name) between 3 and 100)
);
alter table public.pj_celestial_purchase_timezones enable row level security;
revoke all on public.pj_celestial_purchase_timezones from anon,authenticated;
create or replace function public.pj_celestial_timezone_evidence_guard()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from pg_timezone_names where name=new.timezone_name) then
   raise exception 'INVALID_CELESTIAL_TIMEZONE';
 end if;
 if tg_op='UPDATE' and (new.timezone_name is distinct from old.timezone_name or
   new.evidence_source is distinct from old.evidence_source) then
   raise exception 'CELESTIAL_TIMEZONE_EVIDENCE_IMMUTABLE';
 end if;
 return new;
end $$;
drop trigger if exists pj_celestial_timezone_guard on public.pj_celestial_purchase_timezones;
create trigger pj_celestial_timezone_guard before insert or update on public.pj_celestial_purchase_timezones
for each row execute function public.pj_celestial_timezone_evidence_guard();
revoke all on function public.pj_celestial_timezone_evidence_guard() from public,anon,authenticated;

-- When a verified matched purchase receives trusted timezone evidence, or
-- when an already-evidenced purchase becomes attached, evaluate automatically.
create or replace function public.pj_celestial_try_purchase()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_purchase_id uuid; v_tz text;
begin
 if tg_table_name='pj_celestial_purchase_timezones' then
   v_purchase_id:=new.purchase_id;
   v_tz:=new.timezone_name;
 else
   v_purchase_id:=new.id;
   select timezone_name into v_tz from public.pj_celestial_purchase_timezones
   where purchase_id=v_purchase_id;
 end if;
 if v_tz is not null then
   perform public.pj_evaluate_celestial_purchase(v_purchase_id,v_tz);
 end if;
 return new;
end $$;
drop trigger if exists pj_celestial_evidence_insert on public.pj_celestial_purchase_timezones;
create trigger pj_celestial_evidence_insert after insert on public.pj_celestial_purchase_timezones
for each row execute function public.pj_celestial_try_purchase();
drop trigger if exists pj_celestial_purchase_attach on public.purchases;
create trigger pj_celestial_purchase_attach after insert or update of customer_id,import_status,purchase_status on public.purchases
for each row execute function public.pj_celestial_try_purchase();
revoke all on function public.pj_celestial_try_purchase() from public,anon,authenticated;
