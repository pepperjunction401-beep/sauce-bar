
-- Celestial calendar editions: isolated Phase 3 domain.
-- Never ship secret definitions or award conditions via a public client query.
create table if not exists public.pj_celestial_editions (
  edition_year integer primary key check (edition_year between 2026 and 2200),
  artwork_set text not null,
  opens_on date not null,
  closes_before date not null,
  rules_version text not null default '4.4',
  is_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  check (opens_on < closes_before)
);
create table if not exists public.pj_celestial_awards (
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  edition_year integer not null references public.pj_celestial_editions(edition_year),
  month_number smallint not null check (month_number between 1 and 12),
  source_purchase_id uuid not null references public.purchases(id) on delete restrict,
  completed_at timestamptz not null,
  timezone_name text not null,
  earned_at timestamptz not null default now(),
  rules_version text not null,
  primary key (customer_id,edition_year,month_number)
);
create table if not exists public.pj_celestial_evaluation_events (
  id bigint generated always as identity primary key,
  purchase_id uuid not null references public.purchases(id),
  customer_id uuid not null references public.customer_profiles(id),
  edition_year integer,
  month_number smallint,
  result text not null check (result in ('awarded','already_earned','ineligible','missing_timezone','edition_unavailable')),
  evaluated_at timestamptz not null default now(),
  rules_version text not null,
  unique (purchase_id,customer_id)
);
create table if not exists public.pj_celestial_secret_awards (
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  edition_year integer not null references public.pj_celestial_editions(edition_year),
  awarded_at timestamptz not null default now(),
  primary key (customer_id,edition_year)
);
alter table public.pj_celestial_editions enable row level security;
alter table public.pj_celestial_awards enable row level security;
alter table public.pj_celestial_evaluation_events enable row level security;
alter table public.pj_celestial_secret_awards enable row level security;
revoke all on public.pj_celestial_editions,public.pj_celestial_awards,public.pj_celestial_evaluation_events,public.pj_celestial_secret_awards from anon,authenticated;
insert into public.pj_celestial_editions(edition_year,artwork_set,opens_on,closes_before,is_enabled)
values (2026,'celestial-original','2026-01-01','2027-01-01',true),
       (2027,'celestial-original','2027-01-01','2028-01-01',true)
on conflict(edition_year) do nothing;

-- Internal only: must be invoked through a controlled server-side evaluator
-- after accepted purchase ownership is established.
create or replace function public.pj_evaluate_celestial_purchase(
  p_purchase_id uuid, p_checkout_timezone text
) returns text language plpgsql security definer set search_path = public,pg_temp as $$
declare
 v_purchase record;
 v_year integer;
 v_month integer;
 v_local_date date;
 v_edition public.pj_celestial_editions%rowtype;
 v_result text;
begin
 select p.id,p.customer_id,p.completed_at,p.purchase_status,p.import_status,
        p.total_amount,c.account_state
 into v_purchase from public.purchases p
 join public.customer_profiles c on c.id=p.customer_id
 where p.id=p_purchase_id for update of p;
 if not found then return 'ineligible'; end if;
 if v_purchase.account_state <> 'verified_matched'
    or v_purchase.import_status <> 'attached'
    or v_purchase.purchase_status <> 'completed'
    or v_purchase.completed_at is null
    or v_purchase.total_amount <= 0 then return 'ineligible'; end if;

 if p_checkout_timezone is null or not exists
   (select 1 from pg_timezone_names where name=p_checkout_timezone)
 then return 'missing_timezone'; end if;

 v_local_date := (v_purchase.completed_at at time zone p_checkout_timezone)::date;
 v_year := extract(year from v_local_date)::integer;
 v_month := extract(month from v_local_date)::integer;
 select * into v_edition from public.pj_celestial_editions
 where edition_year=v_year and is_enabled
   and v_local_date >= opens_on and v_local_date < closes_before;
 if not found then return 'edition_unavailable'; end if;

 perform 1 from public.customer_profiles where id=v_purchase.customer_id for update;
 insert into public.pj_celestial_awards(customer_id,edition_year,month_number,
   source_purchase_id,completed_at,timezone_name,rules_version)
 values(v_purchase.customer_id,v_year,v_month,v_purchase.id,v_purchase.completed_at,
   p_checkout_timezone,v_edition.rules_version)
 on conflict(customer_id,edition_year,month_number) do nothing;
 v_result := case when found then 'awarded' else 'already_earned' end;
 insert into public.pj_celestial_evaluation_events
  (purchase_id,customer_id,edition_year,month_number,result,rules_version)
 values(v_purchase.id,v_purchase.customer_id,v_year,v_month,v_result,v_edition.rules_version)
 on conflict(purchase_id,customer_id) do nothing;

 -- The 2026-specific completion secret is not included in any public projection.
 if v_year=2026 and (select count(*) from public.pj_celestial_awards
     where customer_id=v_purchase.customer_id and edition_year=2026)=12 then
   insert into public.pj_celestial_secret_awards(customer_id,edition_year)
   values(v_purchase.customer_id,2026)
   on conflict do nothing;
 end if;
 return v_result;
end $$;
revoke all on function public.pj_evaluate_celestial_purchase(uuid,text) from public,anon,authenticated;
