-- Independently recovered Square merchandise must award tokens too.
create or replace function public.pj_passenger_unmapped_award_trigger()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.classification='merchandise' then
  perform public.pj_passenger_evaluate_customer(new.customer_id);
 end if;
 return new;
end $$;
drop trigger if exists pj_passenger_unmapped_auto_award on public.pj_passenger_unmapped_square_evidence;
create trigger pj_passenger_unmapped_auto_award after insert
on public.pj_passenger_unmapped_square_evidence for each row execute function public.pj_passenger_unmapped_award_trigger();
revoke all on function public.pj_passenger_unmapped_award_trigger() from public,anon,authenticated;
