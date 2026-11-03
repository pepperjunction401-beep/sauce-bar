create or replace function public.pj_passenger_dispatch_pending() returns void language plpgsql security definer set search_path=public,extensions,vault,pg_temp as $$
declare k text;
begin
 select decrypted_secret into k from vault.decrypted_secrets where name='pj_reconcile_service_key' limit 1;
 if coalesce(k,'')='' then return; end if;
 if exists(select 1 from public.pj_passenger_history_reconciliation_queue where completed_at is null) then
 perform net.http_post(url:='https://cdbenwthxhypuuipyjlv.supabase.co/functions/v1/passenger-history-reconcile',body:='{}'::jsonb,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||k,'apikey',k),timeout_milliseconds:=30000);
 end if;
end $$;
revoke all on function public.pj_passenger_dispatch_pending() from public,anon,authenticated;
