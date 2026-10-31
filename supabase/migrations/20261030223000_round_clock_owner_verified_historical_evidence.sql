-- Shop O'Round: accept owner-verified historical timezone evidence alongside checkout-captured evidence.
-- Keep provenance immutable; do not fabricate timezones or weaken verified purchase checks.
-- Approved by owner on 2026-10-30. Preserve all other evaluator logic.
create or replace function public.pj_round_clock_evaluate_purchase(p_purchase_id uuid)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare p record; local_time time; minutes integer; code text;
begin
 select u.id,u.customer_id,u.completed_at,u.purchase_status,u.import_status,
        u.total_amount,c.account_state,t.timezone_name,t.evidence_source
 into p
 from public.purchases u
 join public.customer_profiles c on c.id=u.customer_id
 left join public.pj_celestial_purchase_timezones t on t.purchase_id=u.id
 where u.id=p_purchase_id for update of u;
 if not found or p.customer_id is null then return 'ineligible'; end if;
 if p.account_state<>'verified_matched' or p.import_status<>'attached'
    or p.completed_at is null or p.total_amount<=0 then return 'ineligible'; end if;
 if p.evidence_source not in ('checkout_captured','owner_verified_historical')
    or p.timezone_name is null
    or not exists(select 1 from pg_timezone_names where name=p.timezone_name)
 then return 'missing_checkout_timezone'; end if;
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
   update public.pj_round_clock_award_events
   set reversed_at=coalesce(reversed_at,now())
   where purchase_id=p_purchase_id and reversed_at is null;
 elsif p.purchase_status='completed' and code is not null then
   insert into public.pj_round_clock_award_events
     (purchase_id,customer_id,window_code,timezone_name,completed_at)
   values(p_purchase_id,p.customer_id,code,p.timezone_name,p.completed_at)
   on conflict(purchase_id) do nothing;
 end if;
 if (select count(distinct window_code) from public.pj_round_clock_award_events
      where customer_id=p.customer_id and reversed_at is null)=5 then
   insert into public.pj_round_clock_secret_awards(customer_id)
   values(p.customer_id) on conflict do nothing;
 end if;
 return coalesce(code,'no_window');
end $$;
revoke all on function public.pj_round_clock_evaluate_purchase(uuid) from public,anon,authenticated;
