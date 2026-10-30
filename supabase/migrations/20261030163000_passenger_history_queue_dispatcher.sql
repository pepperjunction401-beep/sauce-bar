-- Independent Railroad queue dispatcher (requires private DB configuration).
-- Operational prerequisites per environment:
--   app.settings.pj_reconcile_url: function HTTPS URL for THIS environment
--   app.settings.pj_reconcile_service_key: its service-role key (configure through secure ops; never commit)
-- No keys are stored in source control. Missing settings => no outbound call.
create or replace function public.pj_passenger_dispatch_pending()
returns void language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_url text; v_key text;
begin
 select nullif(current_setting('app.settings.pj_reconcile_url',true),''),
        nullif(current_setting('app.settings.pj_reconcile_service_key',true),'')
 into v_url,v_key;
 if v_url is null or v_key is null then return; end if;
 if v_url !~ '^https://[a-z0-9-]+[.]supabase[.]co/functions/v1/passenger-history-reconcile$' then return; end if;
 if exists(select 1 from public.pj_passenger_history_reconciliation_queue
   where completed_at is null and (claimed_at is null or claimed_at < now()-interval '15 minutes')) then
  perform net.http_post(url:=v_url,body:='{}'::jsonb,
   headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_key,'apikey',v_key),
   timeout_milliseconds:=30000);
 end if;
end $$;
revoke all on function public.pj_passenger_dispatch_pending() from public,anon,authenticated;
-- Scheduling is enabled only once private configuration is installed and tested.
