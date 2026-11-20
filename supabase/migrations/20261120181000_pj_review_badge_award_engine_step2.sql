-- PEPPER JUNCTION | REVIEW BADGE STEP 2 | APPROVAL-EVENT AWARD ENGINE
-- Authorized for Sauce-Bar-Dev and isolated Supabase Testing only, 2026-11-20.
-- Uses ONLY authoritative pj_review_approval_events records; no review moderation,
-- Review Board row rewards, other badge families, or Loyalty Bridge changes.
-- Governing: Badge Rules v4.4 S15/S22D and Review Blueprint S18.
-- Step 1 already installed: public.pj_review_badge_awards + source guard.

-- Restricted, retry-safe Phase 3 evaluator. No browser role may execute it.
CREATE FUNCTION public.pj_review_badge_evaluate_customer(p_customer_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_inserted integer := 0;
BEGIN
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_REVIEW_BADGE_CUSTOMER' USING ERRCODE='22023';
  END IF;

  -- Serialize evaluations of the same customer, including concurrent approvals.
  -- Advisory lock is transaction-local; possible hash collisions only serialize
  -- unrelated customers, never combine their awards.
  PERFORM pg_catalog.pg_advisory_xact_lock(26714, pg_catalog.hashtext(p_customer_id::text));

  -- An approved original review contributes exactly once through its immutable
  -- approval event. Chronological tie-break by review UUID is deterministic.
  -- Each third approved review sources its respective lifetime tier.
  WITH numbered AS (
    SELECT e.review_id, e.approved_at,
           pg_catalog.row_number() OVER
             (ORDER BY e.approved_at, e.review_id) AS review_number
    FROM public.pj_review_approval_events AS e
    JOIN public.pj_review_submissions AS s
      ON s.id=e.review_id
     AND s.customer_id=e.customer_id
     AND s.product_id=e.product_id
    WHERE e.customer_id=p_customer_id
  ),
  thresholds AS (
    SELECT review_id, approved_at, (review_number / 3)::smallint AS tier
    FROM numbered
    WHERE review_number BETWEEN 3 AND 36
      AND (review_number % 3)=0
  )
  INSERT INTO public.pj_review_badge_awards
    (customer_id,tier,source_review_id,earned_at,rules_version)
  SELECT p_customer_id, t.tier, t.review_id, t.approved_at,
         'PJ_SUPABASE_BADGE_RULES_AND_BEHAVIORS:v4.4'
  FROM thresholds AS t
  ORDER BY t.tier
  ON CONFLICT (customer_id,tier) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$function$;

REVOKE ALL ON FUNCTION public.pj_review_badge_evaluate_customer(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pj_review_badge_evaluate_customer(uuid)
  TO service_role;

-- The original Review System still emits approval events unchanged.
-- The badge family listens to the event table, not moderation or reviews.
CREATE FUNCTION public.pj_review_badge_on_approval_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  -- The review must not be rolled back if Phase 3 evaluation fails.
  -- A retry via restricted evaluator can recover unawarded source events.
  BEGIN
    PERFORM public.pj_review_badge_evaluate_customer(NEW.customer_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Review Badge evaluation failed for customer %, event %: %',
      NEW.customer_id, NEW.review_id, SQLERRM;
    RAISE LOG 'Review Badge evaluation failed for customer %, event % (SQLSTATE %): %',
      NEW.customer_id, NEW.review_id, SQLSTATE, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.pj_review_badge_on_approval_event()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pj_review_badge_on_approval_event()
  TO service_role;

CREATE TRIGGER pj_review_badge_after_approval_event
AFTER INSERT ON public.pj_review_approval_events
FOR EACH ROW EXECUTE FUNCTION public.pj_review_badge_on_approval_event();

COMMENT ON FUNCTION public.pj_review_badge_evaluate_customer(uuid) IS
'Restricted replay-safe Phase 3 Review Badge evaluator: every 3 distinct original approval events earns one lifetime tier, maximum 12.';

-- No migration-time award evaluations, fixture backfill, historical repairs,
-- or inserts into existing review tables. Owner-approved reconciliation is separate.
