create or replace function public.pj_round_clock_purchase_trigger()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_table_name='pj_celestial_purchase_timezones' then
   perform public.pj_round_clock_evaluate_purchase(new.purchase_id);
 else
   perform public.pj_round_clock_evaluate_purchase(new.id);
 end if;
 return new;
end $$;
revoke all on function public.pj_round_clock_purchase_trigger() from public,anon,authenticated;