-- Stage 3: permanent Passenger Class tokens (apply after passenger merchandise evidence foundation)
create table if not exists public.pj_passenger_token_definitions (
 token_code text primary key, token_name text not null, railroad_name text not null,
 ordinal integer not null unique check(ordinal between 1 and 7),
 threshold_cents bigint not null unique check(threshold_cents>0)
);
create table if not exists public.pj_passenger_token_awards (
 customer_id uuid not null references public.customer_profiles(id) on delete restrict,
 token_code text not null references public.pj_passenger_token_definitions(token_code),
 earned_at timestamptz not null default now(), primary key(customer_id,token_code)
);
alter table public.pj_passenger_token_definitions enable row level security;
alter table public.pj_passenger_token_awards enable row level security;
revoke all on public.pj_passenger_token_definitions from public,anon,authenticated;
revoke all on public.pj_passenger_token_awards from public,anon,authenticated;
grant select on public.pj_passenger_token_definitions to service_role;
grant select,insert on public.pj_passenger_token_awards to service_role;
insert into public.pj_passenger_token_definitions(token_code,token_name,railroad_name,ordinal,threshold_cents) values
('day_coach','Day Coach Passenger','Providence & Burrillville Street Railway',1,10000),
('parlor_car','Parlor Car Guest','New York Providence & Boston Railroad',2,50000),
('sleeping_car','Sleeping Car Guest','Pawtuxet Valley Railroad',3,100000),
('dining_car','Dining Car Regular','Newport & Narragansett Bay Railroad',4,250000),
('private_car','Private Car Guest','Hartford Providence & Fishkill Railroad',5,500000),
('pullman','Pullman Patron','Narragansett Pier Railroad',6,1000000),
('magnate','Railroad Magnate','New York New Haven & Hartford Railroad',7,2000000)
on conflict(token_code) do nothing;
create or replace function public.pj_passenger_evaluate_customer(p_customer_id uuid)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_spend bigint; v_inserted integer;
begin
 if not exists(select 1 from public.customer_profiles where id=p_customer_id and account_state='verified_matched') then return 0; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_customer_id::text,9218));
 select public.pj_passenger_verified_merchandise_cents(p_customer_id) into v_spend;
 insert into public.pj_passenger_token_awards(customer_id,token_code)
 select p_customer_id,token_code from public.pj_passenger_token_definitions where threshold_cents<=v_spend
 on conflict(customer_id,token_code) do nothing;
 get diagnostics v_inserted=row_count;
 return v_inserted;
end$$;
revoke all on function public.pj_passenger_evaluate_customer(uuid) from public,anon,authenticated;
grant execute on function public.pj_passenger_evaluate_customer(uuid) to service_role;