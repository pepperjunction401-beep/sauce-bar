-- G9 Stage C refinement: order queued evaluations by Square completion time
-- and cover State-only foreign keys for routine DB performance.
-- No changes to upstream purchase/checkout logic or other badge families.
create index if not exists pj_state_customer_levels_state_idx
 on public.pj_state_customer_levels(state_code);
create index if not exists pj_state_credits_state_idx
 on public.pj_state_purchase_credits(state_code);
create index if not exists pj_state_registry_division_idx
 on public.pj_state_registry(division_code);
create index if not exists pj_state_secrets_division_idx
 on public.pj_state_secret_awards(division_code);
create index if not exists pj_state_secrets_source_purchase_idx
 on public.pj_state_secret_awards(source_purchase_id);

create or replace function public.pj_state_process_queue(p_limit integer default 50)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $fn$
declare
 v_job record;
 v_result text;
 v_handled integer:=0;
 v_credited integer:=0;
 v_failed integer:=0;
 v_held integer:=0;
begin
 if p_limit is null or p_limit<1 or p_limit>500
 then raise exception 'State queue batch limit must be 1..500'; end if;

 for v_job in
   select q.purchase_id,q.attempts
   from public.pj_state_evaluation_queue q
   join public.purchases p on p.id=q.purchase_id
   where q.status in ('pending','failed') and q.next_attempt_at<=now()
   order by p.completed_at nulls last,p.id
   for update of q skip locked limit p_limit
 loop
  v_handled:=v_handled+1;
  begin
   v_result:=public.pj_state_evaluate_purchase(v_job.purchase_id);
   update public.pj_state_evaluation_queue
     set status=case when v_result like 'held_%' then 'held' else 'done' end,
         result=v_result,attempts=attempts+1,last_error=null,updated_at=now()
     where purchase_id=v_job.purchase_id;
   if v_result='credited' then v_credited:=v_credited+1; end if;
   if v_result like 'held_%' then v_held:=v_held+1; end if;
  exception when others then
   update public.pj_state_evaluation_queue
     set status='failed',attempts=attempts+1,
         next_attempt_at=now()+make_interval(mins=>least(60,(power(2,least(attempts,6)))::integer)),
         last_error=left(SQLSTATE||': '||SQLERRM,500),
         result='evaluation_failed',updated_at=now()
     where purchase_id=v_job.purchase_id;
   v_failed:=v_failed+1;
  end;
 end loop;
 return jsonb_build_object('handled',v_handled,'credited',v_credited,
                           'held',v_held,'failed',v_failed);
end
$fn$;
