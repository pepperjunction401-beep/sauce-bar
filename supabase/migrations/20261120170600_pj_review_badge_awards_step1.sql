-- PEPPER JUNCTION | REVIEW BADGE STEP 1 | STORAGE-ONLY MIGRATION
-- Authorized for Sauce-Bar-Dev and isolated Supabase Testing only, 2026-11-20.
-- Governing rules: Badge Rules v4.4 Section 15, 22D/22G;
-- Review Blueprint v1.2 Section 18; existing authoritative review approval events.
-- Scope: dedicated permanent award storage + integrity guard + customer-only read.
-- Does NOT evaluate tiers, emit approvals, backfill, or modify existing objects.

CREATE TABLE public.pj_review_badge_awards (
    customer_id uuid NOT NULL
        REFERENCES public.customer_profiles(id),
    tier smallint NOT NULL
        CHECK (tier BETWEEN 1 AND 12),
    source_review_id uuid NOT NULL
        REFERENCES public.pj_review_approval_events(review_id) ON DELETE RESTRICT,
    -- Source approval timestamp, not migration/backfill execution time.
    earned_at timestamptz NOT NULL,
    -- Distinguish the date we stored an award from the date it was earned.
    recorded_at timestamptz NOT NULL DEFAULT now(),
    -- Supplied by the authorized award engine on each evaluation.
    rules_version text NOT NULL CHECK (length(btrim(rules_version)) > 0),
    CONSTRAINT pj_review_badge_awards_pkey PRIMARY KEY (customer_id, tier)
);

COMMENT ON TABLE public.pj_review_badge_awards IS
'One lifetime Review Badge award per customer and tier. Only Phase 3 badge evaluation writes awards; approval events originate in Phase 5.';

ALTER TABLE public.pj_review_badge_awards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pj_review_badge_awards FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.pj_review_badge_awards TO authenticated;
GRANT SELECT, INSERT ON TABLE public.pj_review_badge_awards TO service_role;

CREATE POLICY pj_review_badge_awards_own_read
ON public.pj_review_badge_awards
FOR SELECT TO authenticated
USING (customer_id = (SELECT auth.uid()));

-- Preserve existing approval-event table and its constraints unchanged.
-- Instead, check the source review/customer pair on the *new* award table.
CREATE FUNCTION public.pj_review_badge_award_source_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    v_customer_id uuid;
    v_approved_at timestamptz;
BEGIN
    SELECT e.customer_id, e.approved_at
    INTO v_customer_id, v_approved_at
    FROM public.pj_review_approval_events AS e
    JOIN public.pj_review_submissions AS s
      ON s.id = e.review_id
     AND s.customer_id = e.customer_id
     AND s.product_id = e.product_id
    WHERE e.review_id = NEW.source_review_id;

    IF NOT FOUND OR v_customer_id IS DISTINCT FROM NEW.customer_id THEN
        RAISE EXCEPTION 'INVALID_REVIEW_BADGE_SOURCE'
            USING ERRCODE = '23514';
    END IF;
    IF NEW.earned_at IS DISTINCT FROM v_approved_at THEN
        RAISE EXCEPTION 'INVALID_REVIEW_BADGE_EARNED_TIME'
            USING ERRCODE = '23514';
    END IF;
    -- Intentionally do NOT check current moderation_status: a later q15 edit
    -- may be held, but an already earned original-review credit is permanent.
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.pj_review_badge_award_source_guard()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pj_review_badge_award_source_guard()
    TO service_role;

CREATE TRIGGER pj_review_badge_award_source_guard_before_insert
BEFORE INSERT ON public.pj_review_badge_awards
FOR EACH ROW EXECUTE FUNCTION public.pj_review_badge_award_source_guard();

-- No award-evaluation trigger in Step 1. No inserts, data migration, or backfill.
-- The Phase 3 award writer is separately designed, approved, and tested in Step 2.
-- No existing Review Board, badge-family, Loyalty Bridge, or auth objects altered.