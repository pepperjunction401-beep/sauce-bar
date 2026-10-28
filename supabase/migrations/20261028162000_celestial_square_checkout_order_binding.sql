-- Bind checkout-captured timezone to the specific Square order, server-side only.
create table if not exists public.pj_celestial_checkout_order_timezones (
 square_order_id text primary key,
 checkout_request_id text not null unique,
 timezone_name text not null,
 captured_at timestamptz not null default now(),
 check (length(square_order_id) between 1 and 200)
);
alter table public.pj_celestial_checkout_order_timezones enable row level security;
revoke all on public.pj_celestial_checkout_order_timezones from anon,authenticated;

create or replace function public.pj_celestial_register_checkout_timezone(
 p_order text,p_request text,p_timezone text
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_order is null or length(p_order) not between 1 and 200
 or p_request is null or length(p_request) not between 8 and 80
 or p_timezone is null or not exists(select 1 from pg_timezone_names where name=p_timezone)
 then raise exception 'INVALID_CELESTIAL_CHECKOUT_EVIDENCE'; end if;
 insert into public.pj_celestial_checkout_order_timezones(square_order_id,checkout_request_id,timezone_name)
 values(p_order,p_request,p_timezone)
 on conflict(square_order_id) do nothing;
 if not exists(select 1 from public.pj_celestial_checkout_order_timezones
  where square_order_id=p_order and checkout_request_id=p_request and timezone_name=p_timezone)
 then raise exception 'CELESTIAL_CHECKOUT_BINDING_CONFLICT'; end if;
 insert into public.pj_celestial_purchase_timezones(purchase_id,timezone_name,evidence_source)
 select id,p_timezone,'checkout_captured' from public.purchases
 where square_order_id=p_order and customer_id is not null
 on conflict(purchase_id) do nothing;
end $$;
revoke all on function public.pj_celestial_register_checkout_timezone(text,text,text) from public,anon,authenticated;
grant execute on function public.pj_celestial_register_checkout_timezone(text,text,text) to service_role;

create or replace function public.pj_celestial_bind_order_timezone()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.square_order_id is not null and new.customer_id is not null then
  insert into public.pj_celestial_purchase_timezones(purchase_id,timezone_name,evidence_source)
  select new.id,t.timezone_name,'checkout_captured'
  from public.pj_celestial_checkout_order_timezones t
  where t.square_order_id=new.square_order_id
  on conflict(purchase_id) do nothing;
 end if;
 return new;
end $$;
drop trigger if exists pj_celestial_bind_order_timezone on public.purchases;
create trigger pj_celestial_bind_order_timezone after insert or update of customer_id,square_order_id on public.purchases
for each row execute function public.pj_celestial_bind_order_timezone();
revoke all on function public.pj_celestial_bind_order_timezone() from public,anon,authenticated;
