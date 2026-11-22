-- Pepper Junction: downstream READ-ONLY decision previews.
-- No wallet writes, ledger events, historical order replay, or badge activation.
create function public.pj_legacy_loyalty_transfer_preview(p_customer_id uuid)
returns jsonb language plpgsql stable security invoker
set search_path=pg_catalog,public,pg_temp as $$
declare
 c jsonb;
 v_balance integer;
 v_earn_count integer;
 v_purchase_count integer;
 v_wallet_exists boolean;
 v_prior_credits integer;
 v_ledger_count integer;
begin
 c:=public.pj_legacy_loyalty_classify(p_customer_id);
 if c->>'status'<>'legacy_member' then
   return jsonb_build_object('status',coalesce(c->>'status','pending_snapshot'),
      'transfer_ready',false);
 end if;
 select w.balance into v_balance from public.pj_credit_wallets w where w.customer_id=p_customer_id;
 v_wallet_exists:=found;
 v_prior_credits:=coalesce(v_balance,0);
 select count(*),count(*) filter(where event_kind='purchase_earn')
   into v_ledger_count,v_earn_count from public.pj_credit_ledger
   where customer_id=p_customer_id;
 select count(*) into v_purchase_count from public.purchases
   where customer_id=p_customer_id and source_channel='history_import'
     and purchase_status='completed' and import_status='attached';
 -- No automated additive transfer for a member whose wallet already has
 -- purchases, debits, corrections or any other ledger history. This avoids
 -- double-crediting the legacy period.
 if v_ledger_count>0 or v_prior_credits>0 then
   return jsonb_build_object(
    'status','overlap_review_required',
    'transfer_ready',false,
    'square_available_points',(c->>'square_available_points')::integer,
    'tentative_capped_points',(c->>'tentative_transfer_cap')::integer,
    'current_pj_balance',v_prior_credits,
    'pj_ledger_events',v_ledger_count,
    'pj_purchase_earn_events',v_earn_count,
    'history_imported_orders',v_purchase_count);
 end if;
 return jsonb_build_object(
  'status','awaiting_authorized_cutover',
  'transfer_ready',false,
  'square_available_points',(c->>'square_available_points')::integer,
  'tentative_capped_points',(c->>'tentative_transfer_cap')::integer,
  'current_pj_balance',v_prior_credits,
  'history_imported_orders',v_purchase_count,
  'one_time_transfer_implemented',false);
end $$;

create function public.pj_legacy_nonmember_history_preview(p_customer_id uuid)
returns jsonb language plpgsql stable security invoker
set search_path=pg_catalog,public,pg_temp as $$
declare
 c jsonb;
 v_total integer;
 v_valid integer;
 v_pending integer;
 v_already integer;
 v_credits numeric;
begin
 c:=public.pj_legacy_loyalty_classify(p_customer_id);
 if c->>'status'<>'nonmember_cns_only' then
  return jsonb_build_object('status',coalesce(c->>'status','pending_snapshot'),
   'history_ready',false);
 end if;
 with qualified as (
  select p.id,
   count(li.id) as lines,
   count(li.id) filter(where
       li.cns_slug_snapshot is not null and btrim(li.cns_slug_snapshot)<>''
       and li.pj_credits_rate_snapshot is not null
       and li.pj_credits_rate_snapshot>=0
       and li.pj_credits_rate_snapshot=trunc(li.pj_credits_rate_snapshot)
       and li.quantity>0 and li.quantity=trunc(li.quantity)
       and li.line_total_amount>0
       and li.source_product_snapshot->>'mapping_status'='mapped'
       and li.currency_code=p.currency_code) as valid_lines,
   coalesce(sum(li.quantity*li.pj_credits_rate_snapshot),0) as candidate_credits,
   exists(select 1 from public.pj_credit_ledger l
      where l.source_purchase_id=p.id and l.event_kind='purchase_earn') as already_earned
  from public.purchases p
  left join public.purchase_line_items li on li.purchase_id=p.id
  where p.customer_id=p_customer_id and p.source_channel='history_import'
    and p.purchase_status='completed' and p.import_status='attached'
    and p.completed_at is not null
    and p.total_amount>0 and p.square_customer_id is not null
    and exists(select 1 from public.square_customer_links l
       where l.customer_id=p.customer_id and l.square_customer_id=p.square_customer_id
        and (l.is_active or l.is_historical_alias))
    and not exists(select 1 from public.purchase_refunds r where r.purchase_id=p.id)
  group by p.id
 )
 select count(*)::integer,
        count(*) filter(where lines>0 and lines=valid_lines and not already_earned)::integer,
        count(*) filter(where lines=0 or lines<>valid_lines)::integer,
        count(*) filter(where already_earned)::integer,
        coalesce(sum(candidate_credits) filter(
           where lines>0 and lines=valid_lines and not already_earned),0)
 into v_total,v_valid,v_pending,v_already,v_credits
 from qualified;
 return jsonb_build_object('status','preview_only',
  'history_ready',false,
  'accepted_historical_orders_seen',v_total,
  'cns_fully_mapped_candidates',v_valid,
  'incomplete_or_non_cns_order_holds',v_pending,
  'already_earned_orders',v_already,
  'gross_candidate_points_before_cap',v_credits,
  'cutoff_pending_owner_approval',true,
  'note','Candidates only: no historical credits posted or badges activated');
end $$;

revoke all on function public.pj_legacy_loyalty_transfer_preview(uuid)
  from public,anon,authenticated;
revoke all on function public.pj_legacy_nonmember_history_preview(uuid)
  from public,anon,authenticated;
grant execute on function public.pj_legacy_loyalty_transfer_preview(uuid) to service_role;
grant execute on function public.pj_legacy_nonmember_history_preview(uuid) to service_role;
