-- Railroad modern-secret dispatcher. DEV REVIEW ONLY; not active until production migration.
-- Operational dependency: store the current project's default sb_secret_ key in Vault
-- under pj_reconcile_modern_secret_key using the Supabase Dashboard; never commit it.
-- The scheduled job keeps the same function name and interval.
create or replace function public.pj_passenger_dispatch_pending()
returns void language plpgsql security definer
set search_path=public,extensions,vault,pg_temp
as $$
declare v_key text;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name='pj_reconcile_modern_secret_key' limit 1;
  if v_key is null or v_key not like 'sb_secret_%' then return; end if;
  if exists(select 1 from public.pj_passenger_history_reconciliation_queue
            where completed_at is null) then
    perform net.http_post(
      url:='https://cdbenwthxhypuuipyjlv.supabase.co/functions/v1/passenger-history-reconcile',
      body:='{}'::jsonb,
      headers:=jsonb_build_object('Content-Type','application/json','apikey',v_key),
      timeout_milliseconds:=30000);
  end if;
end $$;
revoke all on function public.pj_passenger_dispatch_pending() from public,anon,authenticated;
