create or replace function public.pj_passenger_evidence_award_trigger()
returns trigger language plpgsql security definer
set search_path=public,pg_temp as $$
declare v_customer uuid;
begin
 select customer_id into v_customer from public.purchases
 where id=new.purchase_id and purchase_status='completed' and import_status='attached';
 if v_customer is not null and new.classification='merchandise' then
   perform public.pj_passenger_evaluate_customer(v_customer);
 end if;
 return new;
end $$;
drop trigger if exists pj_passenger_award_on_evidence on public.pj_passenger_merchandise_evidence;
create trigger pj_passenger_award_on_evidence after insert on public.pj_passenger_merchandise_evidence
for each row execute function public.pj_passenger_evidence_award_trigger();
revoke all on function public.pj_passenger_evidence_award_trigger() from public,anon,authenticated;