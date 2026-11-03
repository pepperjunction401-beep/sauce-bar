-- Pepper Junction | Phase 3 acceptance | REAL-RECEIPT SHADOW AUDIT
-- Read-only: use only to observe already Square-accepted purchases.
-- No wallet crediting, no imported rows, no prod writes, no payment calls.
-- The final full-path PJ Credits test must still run in Testing with
-- independent Square-confirmed evidence and an approved Phase 2 intake.
-- NEVER claim these are newly awarded credits or a successful full-path test.
with accepted as (
  select p.id, p.completed_at,p.source_channel,p.purchase_status,p.import_status,
   p.total_amount,p.currency_code,p.customer_id,p.square_customer_id,
   c.account_state,
   exists (select 1 from public.square_customer_links sc
           where sc.customer_id=p.customer_id
             and sc.square_customer_id=p.square_customer_id
             and (sc.is_active or sc.is_historical_alias)) as accepted_identity
  from public.purchases p
  left join public.customer_profiles c on c.id=p.customer_id
  where p.purchase_status='completed' and p.import_status='attached'
),
lines as (
  select a.id,
    count(li.id)::int as item_lines,
    count(li.id) filter(where li.pj_credits_rate_snapshot is null
      or li.pj_credits_rate_snapshot < 0
      or li.pj_credits_rate_snapshot <> trunc(li.pj_credits_rate_snapshot)
      or li.quantity <= 0 or li.quantity <> trunc(li.quantity)
      or li.cns_slug_snapshot is null or btrim(li.cns_slug_snapshot)=''
      or li.source_product_snapshot->>'mapping_status' is distinct from 'mapped'
      or li.currency_code <> a.currency_code)::int as incomplete_credit_evidence,
    count(li.id) filter(where li.line_total_amount=0)::int as unclassified_zero_price_lines,
    coalesce(sum(li.quantity * li.pj_credits_rate_snapshot),0) as requested_credits
  from accepted a
  left join public.purchase_line_items li on li.purchase_id=a.id
  group by a.id
),
evidence as (
  select a.id,
    count(e.id) filter(where e.event_result='inserted')::int as inserted_events,
    count(e.id) filter(where e.event_result='refreshed')::int as refresh_events
  from accepted a left join public.purchase_import_events e on e.purchase_id=a.id
  group by a.id
)
select row_number() over(order by a.completed_at,a.id) as receipt_number,
  a.completed_at,
  a.source_channel,
  case
    when a.account_state is distinct from 'verified_matched'
       or not a.accepted_identity then 'HOLD_IDENTITY_NOT_ACCEPTED'
    when a.source_channel='history_import' then 'HOLD_HISTORY_SCOPE_NOT_AUTHORIZED'
    when a.source_channel not in ('webhook','signed_in_checkout') then 'HOLD_SOURCE_NOT_APPROVED'
    when a.completed_at is null or a.total_amount<=0 then 'HOLD_PURCHASE_EVIDENCE'
    when l.item_lines=0 then 'HOLD_NO_LINES'
    when l.incomplete_credit_evidence>0 then 'HOLD_INCOMPLETE_SNAPSHOT'
    when l.unclassified_zero_price_lines>0 then 'HOLD_ZERO_PRICE_CLASSIFICATION'
    when e.inserted_events=0 then 'HOLD_NO_RAILROAD_INSERT_EVENT'
    else 'SNAPSHOT_READY_REFERENCE_ONLY_NOT_A_CREDIT_AWARD'
  end as observational_status,
  a.account_state='verified_matched' and a.accepted_identity as accepted_customer_link,
  e.inserted_events,e.refresh_events,l.item_lines,l.incomplete_credit_evidence,
  l.unclassified_zero_price_lines,
  case when a.source_channel in ('webhook','signed_in_checkout') and
     l.incomplete_credit_evidence=0 and l.unclassified_zero_price_lines=0
     and l.item_lines>0 and e.inserted_events>0 and a.accepted_identity
     and a.account_state='verified_matched'
     then l.requested_credits else null end as potential_credits_only
from accepted a join lines l on l.id=a.id join evidence e on e.id=a.id
order by a.completed_at,a.id;