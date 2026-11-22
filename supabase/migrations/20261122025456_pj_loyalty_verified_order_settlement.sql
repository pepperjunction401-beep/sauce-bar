-- Complete delivery only through verified existing Square order intake.
alter table public.pj_loyalty_order_bindings add column reward_line_uid text;
alter table public.pj_loyalty_order_bindings add constraint pj_loyalty_binding_verified_line_shape
 check ((state <> 'paid_verified' and reward_line_uid is null) or
   (state='paid_verified' and ((reward_kind='product' and nullif(btrim(reward_line_uid),'') is not null)
     or (reward_kind='discount' and reward_line_uid is null))));
alter table public.pj_loyalty_exchanges drop constraint pj_loyalty_exchanges_delivery_state_check;
alter table public.pj_loyalty_exchanges add constraint pj_loyalty_exchanges_delivery_state_check
 check (delivery_state in ('awaiting_integration','fulfilled_in_order'));

CREATE OR REPLACE FUNCTION public.pj_credit_evaluate_verified_purchase(p_purchase_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
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
  v_legacy_state record;
  v_legacy_kind jsonb;
  v_bound record;
  v_reward_line_uid text;
begin
  if p_purchase_id is null then
    return jsonb_build_object('result','ineligible','reason','missing_purchase_id');
  end if;

  -- The accepted Phase 2 purchase row is the only purchase truth consumed here.
  select p.id, p.customer_id, p.purchase_status, p.import_status,
         p.source_channel, p.square_order_id, p.square_payment_id, p.square_customer_id,
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
  -- Keep the same accepted Square identity proof required by the Railroad.
  -- Do not independently resolve or reassign customer identity here.
  if v_p.square_customer_id is null or not exists(
    select 1 from public.square_customer_links link
    where link.customer_id=v_p.customer_id
      and link.square_customer_id=v_p.square_customer_id
      and (link.is_active=true or link.is_historical_alias=true)
  ) then
    return jsonb_build_object('result','ineligible','reason','phase1_square_identity_link_missing');
  end if;
  v_customer := v_p.customer_id;

  -- The established live webhook / signed-in checkout pathway is unchanged.
  -- Historical purchase branch is NEVER enabled by default.
  if v_p.source_channel='history_import' then
    select * into v_legacy_state from public.pj_legacy_loyalty_activation
     where singleton=true;
    if not found or not v_legacy_state.nonmember_history_enabled
       or v_legacy_state.history_cutoff_at is null then
      return jsonb_build_object('result','held','reason','cns_history_not_activated');
    end if;
    if v_p.completed_at >= v_legacy_state.history_cutoff_at then
      return jsonb_build_object('result','held','reason','outside_approved_history_cutoff');
    end if;
    v_legacy_kind:=public.pj_legacy_loyalty_classify(v_customer);
    if v_legacy_kind->>'status' is distinct from 'nonmember_cns_only' then
      return jsonb_build_object('result','held','reason','legacy_cohort_classification_not_nonmember');
    end if;
    -- Earlier already-evaluated history events are permitted, in source
    -- completion order. Any live earning, correction, exchange, unrelated
    -- ledger event or out-of-order history blocks the courtesy replay.
    if exists(
      select 1 from public.pj_credit_ledger l
      left join public.purchases prior on prior.id=l.source_purchase_id
      where l.customer_id=v_customer and (
        l.event_kind <> 'purchase_earn'
        or prior.source_channel is distinct from 'history_import'
        or prior.completed_at is null
        or (prior.completed_at,prior.id) > (v_p.completed_at,p_purchase_id)
      )
    ) or (
      exists(select 1 from public.pj_credit_wallets w
        where w.customer_id=v_customer and w.balance>0)
      and not exists(select 1 from public.pj_credit_ledger l
        where l.customer_id=v_customer and l.event_kind='purchase_earn')
    ) then
      return jsonb_build_object('result','held',
        'reason','history_overlaps_live_or_out_of_order_credits');
    end if;
  elsif v_p.source_channel not in ('webhook','signed_in_checkout') then
    return jsonb_build_object('result','held','reason','source_requires_approved_earning_scope');
  end if;

  -- A bound Loyalty order earns only after the verified exchange is settled.
  -- Exclude precisely the confirmed complimentary line, not other $0 lines.
  if v_p.source_channel in ('webhook','signed_in_checkout') and v_p.square_order_id is not null then
    select b.state,b.reward_kind,b.reward_line_uid,b.customer_id
      into v_bound from public.pj_loyalty_order_bindings b
      where b.square_order_id=v_p.square_order_id;
    if found then
      if v_bound.customer_id is distinct from v_customer or v_bound.state <> 'paid_verified' then
        return jsonb_build_object('result','held','reason','loyalty_verified_settlement_pending');
      end if;
      if v_bound.reward_kind='product' then
        v_reward_line_uid:=v_bound.reward_line_uid;
        if v_reward_line_uid is null then
          return jsonb_build_object('result','held','reason','loyalty_reward_line_evidence_missing');
        end if;
      end if;
    end if;
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
   where li.purchase_id=p_purchase_id
     and not (v_reward_line_uid is not null and li.square_line_item_uid is not distinct from v_reward_line_uid and li.line_total_amount=0);

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
$function$;

-- Only the trusted importer may submit a verified Square receipt.
-- Keep existing atomic exchange/debit engine; add the missing order proof.
create function public.pj_loyalty_settle_verified_order(
 p_purchase_id uuid,p_square_order_id text,p_reward_line_uid text
) returns jsonb
language plpgsql security definer
set search_path = 'pg_catalog','public','pg_temp'
as $function$
declare p record; b record; t record; x jsonb; earn jsonb; v_exchange_id uuid;
begin
 if p_purchase_id is null or nullif(btrim(p_square_order_id),'') is null then
   return jsonb_build_object('status','invalid_input','committed',false);
 end if;
 select u.id,u.customer_id,u.square_order_id,u.purchase_status,u.import_status,
        u.source_channel,u.total_amount,u.square_payment_id,u.square_payment_ids
   into p from public.purchases u where u.id=p_purchase_id for share;
 if not found or p.square_order_id is distinct from p_square_order_id or
    p.purchase_status <> 'completed' or p.import_status <> 'attached' or
    p.source_channel not in ('webhook','signed_in_checkout') or p.total_amount <= 0 or
    (p.square_payment_id is null and coalesce(cardinality(p.square_payment_ids),0)=0)
 then return jsonb_build_object('status','unverified_paid_purchase','committed',false); end if;
 select * into b from public.pj_loyalty_order_bindings v
  where v.square_order_id=p_square_order_id for update;
 if not found or b.customer_id is distinct from p.customer_id or
    b.state not in ('opened','paid_verified') then
   return jsonb_build_object('status','order_binding_not_verified','committed',false);
 end if;
 if b.state='paid_verified' then
   select e.id into v_exchange_id from public.pj_loyalty_exchanges e
     where e.source_purchase_id=p_purchase_id and e.customer_id=b.customer_id
      and e.token_number=b.token_number and e.delivery_state='fulfilled_in_order';
   if not found or b.reward_line_uid is distinct from p_reward_line_uid then
     return jsonb_build_object('status','settlement_replay_conflict','committed',false);
   end if;
   x:=jsonb_build_object('status','already_committed','committed',true,'exchange_id',v_exchange_id);
 else
   select * into t from public.pj_loyalty_token_definitions d where d.token_number=b.token_number;
   if not found or t.tier_cost is distinct from b.tier_cost or
       t.reward_kind is distinct from b.reward_kind or
       t.reward_product_slug is distinct from b.reward_product_slug or
       t.discount_percent is distinct from b.discount_percent then
      return jsonb_build_object('status','reward_definition_changed','committed',false);
   end if;
   if b.reward_kind='product' then
     if nullif(btrim(p_reward_line_uid),'') is null or not exists(
       select 1 from public.purchase_line_items li where li.purchase_id=p_purchase_id
         and li.square_line_item_uid=p_reward_line_uid and li.quantity=1 and li.line_total_amount=0
         and li.cns_slug_snapshot=b.reward_product_slug
         and li.square_catalog_object_id=b.reward_variation_id
     ) or (select count(*) from public.purchase_line_items li
          where li.purchase_id=p_purchase_id and li.line_total_amount=0)<>1
     then return jsonb_build_object('status','complimentary_line_not_verified','committed',false); end if;
   elsif p_reward_line_uid is not null or exists(
      select 1 from public.purchase_line_items li where li.purchase_id=p_purchase_id and li.line_total_amount<=0)
   then return jsonb_build_object('status','discount_line_not_verified','committed',false); end if;
   if not exists(select 1 from public.purchase_line_items li where li.purchase_id=p_purchase_id and li.line_total_amount>0)
     or exists(select 1 from public.purchase_refunds r where r.purchase_id=p_purchase_id)
   then return jsonb_build_object('status','purchase_requires_reconciliation','committed',false); end if;
   x:=public.pj_loyalty_commit_paid_exchange(p_purchase_id,b.token_number);
   if x->>'committed' is distinct from 'true' then return x; end if;
   v_exchange_id:=(x->>'exchange_id')::uuid;
   update public.pj_loyalty_exchanges e set delivery_state='fulfilled_in_order'
      where e.id=v_exchange_id and e.source_purchase_id=p_purchase_id
        and e.customer_id=b.customer_id and e.token_number=b.token_number;
   if not found then raise exception 'PJ_LOYALTY_EXCHANGE_EVIDENCE_MISSING'; end if;
   update public.pj_loyalty_order_bindings set state='paid_verified',reward_line_uid=p_reward_line_uid,verified_at=now()
     where checkout_request_id=b.checkout_request_id and state='opened';
   if not found then raise exception 'PJ_LOYALTY_BINDING_REPLAY_CONFLICT'; end if;
 end if;
 -- Existing evaluator now sees the settled proof. Earn paid-merchandise
 -- credits after spending the token; free merchandise never earns.
 -- Preserve the valid settlement if unrelated earning evidence is incomplete.
 begin
    earn:=public.pj_credit_evaluate_verified_purchase(p_purchase_id);
 exception when others then
    raise warning 'PJ Loyalty settlement earning retry required (SQLSTATE %)',SQLSTATE;
    earn:=jsonb_build_object('result','held','reason','earning_retry_required');
 end;
 return x || jsonb_build_object('delivery_state','fulfilled_in_order','earning',earn);
end
$function$;

revoke all on function public.pj_loyalty_settle_verified_order(uuid,text,text) from public,anon,authenticated;
grant execute on function public.pj_loyalty_settle_verified_order(uuid,text,text) to service_role;
-- The pre-integration debit RPC must not be callable directly by the service
-- role: the server-only settlement routine above owns the evidence check.
revoke execute on function public.pj_loyalty_commit_paid_exchange(uuid,integer) from service_role;
