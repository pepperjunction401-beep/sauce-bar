-- PJ / Phase 3 Loyalty Bridge credit-earning subscriber.
-- Reuses EXISTING Phase 3 purchase_import_events handoff (already used by
-- Purchase Progress) without changing Square, Phase 1/2 recorders, or checkout.
-- Fires only on the post-line-item accepted event, never on cart or pending pay.
--
-- Only new/current Square webhook or accepted signed-in purchase channels.
-- Historical recovery, owner correction and reconciliation are excluded until
-- the owner-approved history scope and ordering rules are signed off.
-- A failing credit evaluation is logged but cannot sabotage Square/Phase 2.
create function public.pj_credit_on_accepted_purchase_event()
returns trigger language plpgsql security invoker
set search_path=pg_catalog, public, pg_temp as $$
declare
  v_source text;
  v_result jsonb;
begin
  if new.purchase_id is null or new.event_result not in ('inserted','refreshed') then
    return new;
  end if;

  begin
    select p.source_channel into v_source
      from public.purchases p where p.id=new.purchase_id;

    if v_source in ('webhook','signed_in_checkout') then
      v_result:=public.pj_credit_evaluate_verified_purchase(new.purchase_id);
      if v_result->>'result'='held' then
        raise log 'PJ Credit evaluation awaiting existing upstream evidence for accepted event %: %',
          new.id, v_result->>'reason';
      end if;
    end if;
  exception when others then
    -- Exception subtransaction rolls back any incomplete wallet/ledger writes.
    -- Leave the upstream accepted Square transaction/event intact for retry.
    raise warning 'PJ Phase 3 credit evaluation failed for accepted event % (SQLSTATE %); Railroad preserved: %',
      new.id, SQLSTATE, SQLERRM;
  end;
  return new;
end $$;
revoke all on function public.pj_credit_on_accepted_purchase_event()
  from public, anon, authenticated;
grant execute on function public.pj_credit_on_accepted_purchase_event()
  to service_role;

create trigger pj_credit_after_import_event
after insert on public.purchase_import_events
for each row
when (new.event_result in ('inserted','refreshed') and new.purchase_id is not null)
execute function public.pj_credit_on_accepted_purchase_event();
