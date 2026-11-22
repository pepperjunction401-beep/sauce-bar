-- Pepper Junction Phase 3 / PJ Credits — verified purchase evaluator.
-- This is a downstream consumer only, never a source of Square/Phase 1/2 truth.
-- Invoked exclusively by a trusted server-side Phase 3 handoff, once the
-- accepted purchase and ALL mapped line-item snapshots have been committed.
-- Deliberately no triggers, schedulers, webhook routes, or checkout changes.
-- History replay / D07 and automatic handoff / D11 remain activation gates.
create function public.pj_credit_evaluate_verified_purchase(p_purchase_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_p record;
  v_customer uuid;
  v_line_count integer;
  v_incomplete_count integer;
  v_zero_price_count integer;
  v_requested_numeric numeric;
  v_requested integer;
  v_balance integer;
  v_awarded integer;
  v_after integer;
  v_existing record;
begin
  if p_purchase_id is null then
    return jsonb_build_object('result','ineligible','reason','missing_purchase_id');
  end if;

  -- The accepted Phase 2 purchase row is the only purchase truth consumed here.
  select p.id, p.customer_id, p.purchase_status, p.import_status,
         p.source_channel, p.square_order_id, p.square_payment_id,
         p.total_amount, p.completed_at, c.account_state
    into v_p
    from public.purchases p
    left join public.customer_profiles c on c.id=p.customer_id
   where p.id=p_purchase_id
   for share of p;
  if not found then
    return jsonb_build_object('result','ineligible','reason','purchase_not_found');
  end if;

  -- A prior completed evaluation is final, including a zero-credit award at cap.
  select l.customer_id, l.credit_delta, l.balance_after
    into v_existing
    from public.pj_credit_ledger l
   where l.source_purchase_id=p_purchase_id
     and l.event_kind='purchase_earn';
  if found then
    return jsonb_build_object('result','already_evaluated','awarded_credits',v_existing.credit_delta);
  end if;

  if v_p.customer_id is null or v_p.account_state is distinct from 'verified_matched'
     or v_p.purchase_status <> 'completed' or v_p.import_status <> 'attached'
     or v_p.completed_at is null or v_p.total_amount <= 0
     or (v_p.square_order_id is null and v_p.square_payment_id is null)
  then
    return jsonb_build_object('result','ineligible','reason','phase1_phase2_not_accepted');
  end if;
  v_customer := v_p.customer_id;

  -- D07 is unresolved: do not silently activate historical earning or backfill.
  if v_p.source_channel='history_import' then
    return jsonb_build_object('result','held','reason','historical_earning_scope_unapproved');
  end if;

  -- Refund consequences / partial rounding must be handled by the approved
  -- Square refund path in the later phase, not silently guessed during earning.
  if exists(select 1 from public.purchase_refunds r where r.purchase_id=p_purchase_id) then
    return jsonb_build_object('result','held','reason','refund_evidence_requires_reconciliation');
  end if;

  select count(*)::integer,
         count(*) filter (where li.quantity is null
                           or li.quantity <= 0 or li.quantity <> trunc(li.quantity)
                           or li.pj_credits_rate_snapshot is null
                           or li.pj_credits_rate_snapshot < 0
                           or li.pj_credits_rate_snapshot <> trunc(li.pj_credits_rate_snapshot)
                           or li.cns_slug_snapshot is null
                           or btrim(li.cns_slug_snapshot)=''
                           or li.source_product_snapshot->>'mapping_status' is distinct from 'mapped'
                           or li.currency_code <> p.currency_code)::integer,
         count(*) filter (where li.line_total_amount=0)::integer,
         coalesce(sum(li.quantity * li.pj_credits_rate_snapshot),0)
    into v_line_count, v_incomplete_count, v_zero_price_count, v_requested_numeric
    from public.purchase_line_items li
    join public.purchases p on p.id=li.purchase_id
   where li.purchase_id=p_purchase_id;

  if v_line_count=0 then
    return jsonb_build_object('result','held','reason','missing_accepted_purchase_lines');
  end if;
  if v_incomplete_count>0 then
    return jsonb_build_object('result','held','reason','incomplete_authoritative_line_snapshot');
  end if;
  -- The current Phase 2 line shape has no approved promotional reward flag.
  -- A $0 reward line must not earn, but other free goods cannot be assumed
  -- promotional: hold for classification rather than inventing a policy.
  if v_zero_price_count>0 then
    return jsonb_build_object('result','held','reason','zero_dollar_line_requires_classification');
  end if;
  if v_requested_numeric <> trunc(v_requested_numeric)
     or v_requested_numeric < 0 or v_requested_numeric > 2147483647 then
    return jsonb_build_object('result','held','reason','credit_quantity_or_rate_invalid');
  end if;
  v_requested:=v_requested_numeric::integer;

  -- One wallet row lock serializes all purchases and future exchanges for a
  -- customer. The ledger insert and wallet change share the same transaction.
  insert into public.pj_credit_wallets(customer_id,balance)
  values(v_customer,0)
  on conflict(customer_id) do nothing;
  select w.balance into v_balance
    from public.pj_credit_wallets w
   where w.customer_id=v_customer for update;
  if not found then raise exception 'CREDIT_WALLET_LOCK_FAILED'; end if;

  -- Recheck after serialization so parallel retries cannot double-award.
  select l.customer_id, l.credit_delta, l.balance_after
    into v_existing
    from public.pj_credit_ledger l
   where l.source_purchase_id=p_purchase_id
     and l.event_kind='purchase_earn';
  if found then
    return jsonb_build_object('result','already_evaluated','awarded_credits',v_existing.credit_delta);
  end if;

  v_awarded:=least(v_requested,275-v_balance);
  v_after:=v_balance+v_awarded;

  insert into public.pj_credit_ledger (
    customer_id,event_kind,event_key,source_purchase_id,requested_credits,
    credit_delta,balance_before,balance_after,rules_version,source_effective_at
  ) values (
    v_customer,'purchase_earn','square_accepted_purchase:'||p_purchase_id::text,p_purchase_id,
    v_requested,v_awarded,v_balance,v_after,'4.4',v_p.completed_at
  );
  update public.pj_credit_wallets
     set balance=v_after, row_version=row_version+1,updated_at=now()
   where customer_id=v_customer;

  return jsonb_build_object('result','earned','purchase_id',p_purchase_id,
    'requested_credits',v_requested,'awarded_credits',v_awarded,
    'unawarded_at_cap',v_requested-v_awarded,'balance_before',v_balance,
    'balance_after',v_after,'rules_version','4.4');
end
$$;
-- INVOKER functions require caller's table privileges; only the trusted
-- service role may execute this evaluator, never browsers.
revoke all on function public.pj_credit_evaluate_verified_purchase(uuid)
  from public,anon,authenticated;
grant execute on function public.pj_credit_evaluate_verified_purchase(uuid)
  to service_role;
