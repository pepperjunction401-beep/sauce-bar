-- Shop O'Round the Clock: five local-time windows and a hidden completion award.
-- Consume the same validated purchase timezone evidence as Celestial.
create table if not exists public.pj_round_clock_award_events (
 purchase_id uuid primary key references public.purchases(id) on delete restrict,
 customer_id uuid not null references public.customer_profiles(id) on delete cascade,
 window_code text not null check(window_code in ('early_bird','lunch_hour','evening_commute','late_night','night_owl')),
 timezone_name text not null,
 completed_at timestamptz not null,
 reversed_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists pj_round_clock_events_customer_window on public.pj_round_clock_award_events(customer_id,window_code);
create table if not exists public.pj_round_clock_secret_awards (
 customer_id uuid primary key references public.customer_profiles(id) on delete cascade,
 awarded_at timestamptz not null default now()
);
alter table public.pj_round_clock_award_events enable row level security;
alter table public.pj_round_clock_secret_awards enable row level security;
revoke all on public.pj_round_clock_award_events,public.pj_round_clock_secret_awards from anon,authenticated;

create or replace function public.pj_round_clock_evaluate_purchase(p_purchase_id uuid)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare p record; z text; local_time time; minutes integer; code text;
begin
 select u.id,u.customer_id,u.completed_at,u.purchase_status,u.import_status,u.total_amount,c.account_state,
        t.timezone_name into p
 from public.purchases u join public.customer_profiles c on c.id=u.customer_id
 left join public.pj_celestial_purchase_timezones t on t.purchase_id=u.id
 where u.id=p_purchase_id for update of u;
 if not found or p.customer_id is null then return 'ineligible'; end if;
 if p.account_state<>'verified_matched' or p.import_status<>'attached'
    or p.completed_at is null or p.total_amount<=0 then return 'ineligible'; end if;
 if p.timezone_name is null or not exists(select 1 from pg_timezone_names where name=p.timezone_name)
 then return 'missing_timezone'; end if;
 local_time:=(p.completed_at at time zone p.timezone_name)::time;
 minutes:=extract(hour from local_time)::integer*60+extract(minute from local_time)::integer;
 code:=case
   when minutes>=330 and minutes<420 then 'early_bird'
   when minutes>=690 and minutes<780 then 'lunch_hour'
   when minutes>=990 and minutes<1080 then 'evening_commute'
   when minutes>=1350 then 'late_night'
   when minutes>=90 and minutes<180 then 'night_owl'
   else null end;
 if p.purchase_status='refunded' then
   update public.pj_round_clock_award_events set reversed_at=coalesce(reversed_at,now())
   where purchase_id=p_purchase_id and reversed_at is null;
 elsif p.purchase_status='completed' and code is not null then
   insert into public.pj_round_clock_award_events
    (purchase_id,customer_id,window_code,timezone_name,completed_at)
   values (p_purchase_id,p.customer_id,code,p.timezone_name,p.completed_at)
   on conflict(purchase_id) do nothing;
 end if;
 -- Completion secret is permanent once legitimately unlocked; any future
 -- correction to secret-retention policy requires owner review.
 if (select count(distinct window_code) from public.pj_round_clock_award_events
     where customer_id=p.customer_id and reversed_at is null)=5 then
   insert into public.pj_round_clock_secret_awards(customer_id)
   values(p.customer_id) on conflict do nothing;
 end if;
 return coalesce(code,'no_window');
end $$;
revoke all on function public.pj_round_clock_evaluate_purchase(uuid) from public,anon,authenticated;

create or replace function public.pj_round_clock_purchase_trigger()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.pj_round_clock_evaluate_purchase(
   case when tg_table_name='pj_celestial_purchase_timezones' then new.purchase_id else new.id end);
 return new;
end $$;
drop trigger if exists pj_round_clock_on_timezone on public.pj_celestial_purchase_timezones;
create trigger pj_round_clock_on_timezone after insert on public.pj_celestial_purchase_timezones
for each row execute function public.pj_round_clock_purchase_trigger();
drop trigger if exists pj_round_clock_on_purchase on public.purchases;
create trigger pj_round_clock_on_purchase after insert or update of customer_id,import_status,purchase_status
on public.purchases for each row execute function public.pj_round_clock_purchase_trigger();
revoke all on function public.pj_round_clock_purchase_trigger() from public,anon,authenticated;

-- Public client sees only its own earned counts. Do not leak window thresholds or secrets.
create or replace function public.pj_round_clock_my_levels()
returns table(window_code text, earned_level bigint) language sql stable security definer
set search_path=public,pg_temp as $$
select e.window_code,count(*)::bigint from public.pj_round_clock_award_events e
where auth.uid() is not null and e.customer_id=auth.uid() and e.reversed_at is null
group by e.window_code
$$;
revoke all on function public.pj_round_clock_my_levels() from public,anon;
grant execute on function public.pj_round_clock_my_levels() to authenticated;
