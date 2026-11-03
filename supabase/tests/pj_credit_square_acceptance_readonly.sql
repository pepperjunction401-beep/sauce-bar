-- PEPPER JUNCTION — VERIFIED SQUARE PURCHASE ACCEPTANCE (READ ONLY)
-- Purpose: prove Phase 1/2 accepted receipt -> Phase 3 credits -> wallet -> bridge tiers.
-- Run only against isolated Supabase Testing. Never invokes Square or creates an order.
-- First replace the placeholder with an ORDER ID actually confirmed by Square and
-- accepted through the EXISTING Railroad; do not use a synthetic fixture or payment link.
-- Only after Square confirmation and Phase 1/2 attachment can this report pass.
-- This query does not prove the external Square API response by itself; retain the
-- original Square confirmation alongside it as independent proof.
WITH
params AS (
  SELECT nullif('REPLACE_WITH_ACTUAL_SQUARE_ORDER_ID','REPLACE_WITH_ACTUAL_SQUARE_ORDER_ID')::text AS square_order_id
),
purchase AS (
  SELECT p.* FROM public.purchases p
  JOIN params q ON p.square_order_id=q.square_order_id
),
line_check AS (
  SELECT li.purchase_id,
    count(*)::integer AS lines,
    count(*) FILTER(WHERE li.quantity IS NULL OR li.quantity<>trunc(li.quantity)
      OR li.quantity<=0 OR li.pj_credits_rate_snapshot IS NULL
      OR li.pj_credits_rate_snapshot<0
      OR li.pj_credits_rate_snapshot<>trunc(li.pj_credits_rate_snapshot)
      OR li.cns_slug_snapshot IS NULL OR btrim(li.cns_slug_snapshot)=''
      OR li.source_product_snapshot->>'mapping_status' IS DISTINCT FROM 'mapped'
      OR li.currency_code<>p.currency_code)::integer AS lines_missing_evidence,
    count(*) FILTER(WHERE li.line_total_amount=0)::integer AS zero_dollar_lines,
    coalesce(sum(li.quantity*li.pj_credits_rate_snapshot),0)::numeric AS requested_snapshot_credits
  FROM purchase p JOIN public.purchase_line_items li ON li.purchase_id=p.id
  GROUP BY li.purchase_id
),
receipt AS (
 SELECT e.purchase_id,
   count(*) FILTER (WHERE e.event_result='inserted')::integer AS railroad_inserted,
   count(*) FILTER (WHERE e.event_result='refreshed')::integer AS railroad_refreshed
 FROM public.purchase_import_events e JOIN purchase p ON p.id=e.purchase_id
 GROUP BY e.purchase_id
),
ledger AS (
 SELECT l.source_purchase_id,
 count(*)::integer AS earn_events,
 max(l.requested_credits) AS requested_credits,
 max(l.credit_delta) AS awarded_credits,
 max(l.balance_before) AS balance_before,
 max(l.balance_after) AS balance_after
 FROM public.pj_credit_ledger l JOIN purchase p ON p.id=l.source_purchase_id
 WHERE l.event_kind='purchase_earn'
 GROUP BY l.source_purchase_id
)
SELECT
  CASE
    WHEN params.square_order_id IS NULL THEN 'NOT_RUN_ORDER_ID_REQUIRED'
    WHEN p.id IS NULL THEN 'NO_ACCEPTED_RAILROAD_PURCHASE'
    WHEN p.source_channel NOT IN ('webhook','signed_in_checkout')
      THEN 'HOLD_UNAPPROVED_HISTORY_OR_CORRECTION_CHANNEL'
    WHEN p.purchase_status<>'completed' OR p.import_status<>'attached'
      OR p.completed_at IS NULL OR p.total_amount<=0
      OR p.square_order_id IS NULL OR p.customer_id IS NULL
      THEN 'HOLD_NOT_ACCEPTED_COMPLETED_PURCHASE'
    WHEN c.account_state IS DISTINCT FROM 'verified_matched'
      OR NOT EXISTS (
        SELECT 1 FROM public.square_customer_links l
        WHERE l.customer_id=p.customer_id AND l.square_customer_id=p.square_customer_id
          AND (l.is_active OR l.is_historical_alias)
      ) THEN 'HOLD_PHASE_1_IDENTITY_NOT_VERIFIED'
    WHEN coalesce(rl.railroad_inserted,0)=0 THEN 'HOLD_NO_ORIGINAL_RAILROAD_INSERT_EVENT'
    WHEN coalesce(lines.lines,0)=0 OR coalesce(lines.lines_missing_evidence,0)>0
      OR coalesce(lines.zero_dollar_lines,0)>0
      THEN 'HOLD_INCOMPLETE_OR_UNCLASSIFIED_CNS_EVIDENCE'
    WHEN coalesce(le.earn_events,0)<>1 THEN 'FAIL_CREDIT_LEDGER_MISSING_OR_DUPLICATE'
    WHEN le.requested_credits IS DISTINCT FROM lines.requested_snapshot_credits
      OR le.awarded_credits IS DISTINCT FROM least(le.requested_credits,275-le.balance_before)
      OR le.balance_after IS DISTINCT FROM le.balance_before+le.awarded_credits
      THEN 'FAIL_CREDIT_LEDGER_ARITHMETIC'
    WHEN w.customer_id IS NULL OR w.balance<0 OR w.balance>275
      THEN 'FAIL_WALLET_MISSING_OR_INVALID'
    ELSE 'PASS_DATABASE_CHAIN_PENDING_INDEPENDENT_SQUARE_RECEIPT_AND_BROWSER_CHECK'
  END AS acceptance_status,
  p.source_channel,
  p.purchase_status,
  p.import_status,
  c.account_state AS phase_1_account_state,
  coalesce(rl.railroad_inserted,0) AS railroad_insert_events,
  coalesce(rl.railroad_refreshed,0) AS railroad_retries,
  coalesce(lines.lines,0) AS purchase_lines,
  coalesce(lines.lines_missing_evidence,0) AS lines_missing_authoritative_evidence,
  coalesce(lines.zero_dollar_lines,0) AS zero_dollar_lines_requiring_classification,
  lines.requested_snapshot_credits,
  coalesce(le.earn_events,0) AS purchase_earn_ledger_entries,
  le.requested_credits AS ledger_requested,
  le.awarded_credits AS ledger_awarded,
  le.balance_before,
  le.balance_after,
  w.balance AS current_wallet_balance,
  (SELECT count(*) FROM public.pj_loyalty_token_definitions t
   WHERE w.balance>=t.tier_cost) AS currently_balance_qualified_bridges,
  'Real Square receipt and signed-in Dev Depot visual check are independent acceptance gates'
     AS external_evidence_requirement
FROM params
LEFT JOIN purchase p ON true
LEFT JOIN public.customer_profiles c ON c.id=p.customer_id
LEFT JOIN line_check lines ON lines.purchase_id=p.id
LEFT JOIN receipt rl ON rl.purchase_id=p.id
LEFT JOIN ledger le ON le.source_purchase_id=p.id
LEFT JOIN public.pj_credit_wallets w ON w.customer_id=p.customer_id;
