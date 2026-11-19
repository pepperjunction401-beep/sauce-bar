# Pepper Junction — Automated Passenger Review Moderation (Dev/Testing)
Date: 2026-11-19. Owner authorization: develop automated clean approval, flagged freeze, owner-only moderation queue and flagged-only email notification. Notification recipient: john@pepperjunction401.com.

## Governing boundaries
- Governed by `PJ_REVIEW_SYSTEM_BLUEPRINT_v1.2_GOVERNING` §§12–14, 18, 20, and `PJ_review_html_Architecture_Integration_Guide_OFFICIAL_v2.1_2026-11-18`.
- Clean original review → approved. Flagged original → frozen. No manual processing of normal reviews.
- q15 is public-eligible text, q14 remains private; both original written fields are screened at acceptance. Existing private note editing does not become a new review.
- Review Board GREEN and eight-slot entitlements remain submission-based; public Passenger Notes and review badge events remain approval-based. No Square, badge evaluation, loyalty, product page or Main code changes.
- `review.html` unchanged. Existing submissions are not automatically reclassified in this Dev task.

## Implemented on Sauce-Bar-Dev
1. `supabase/sql/pj_review_automated_moderation_dev.sql` — service-only `pj_review_apply_moderation` and `pj_review_owner_moderation_decision` RPCs; private flagged case table; audited owner decisions; RLS enabled; no direct grants to anon/authenticated.
2. `supabase/functions/pj-review-service/index.ts` — after authenticated, verified-purchase review acceptance, applies server-side deterministic written-content screening, automatically approves clean reviews or freezes flagged ones; failure stays pending. Approval triggers the existing review approval event. Adds owner email sender integration gated by `RESEND_API_KEY` and `PJ_REVIEW_ALERT_FROM`; flags persist even if mail is not configured or deliverable; Testing never emails the real owner.
3. `supabase/functions/pj-review-moderation-admin/index.ts` — private owner-only queue and approve/reject actions. Requires verified Supabase user with exact matching `PJ_REVIEW_OWNER_USER_ID` and email `john@pepperjunction401.com`. Owner identity comes from verified server JWT, not request body or editable JWT metadata. The queue selects only frozen submissions; all decisions are audited.
4. `review-moderation.html` — owner moderation UI, noindex, private flag details via server only, approve/reject controls. Authentication uses existing PJAuth; no new owner credentials are stored in site code.

## Testing environment actions (Production UNTOUCHED)
- Supabase Testing `slubpfmpjgoupujptayy`: moderation schema migration `pj_review_automated_moderation_owner_queue` applied successfully.
- Testing `pj-review-service` deployed ACTIVE v17, `verify_jwt=false` with explicit server JWT verification, matching the existing function gateway setup.
- Testing `pj-review-moderation-admin` deployed ACTIVE v2, `verify_jwt=false` with verified owner JWT and UUID authorization in function body.
- Static screening scenarios passed locally: clean prose, URL, email, phone number, symbol runs, profanity, standalone forbidden term, approved product-name exception, explicit threat, sexual terms, repeated-character gibberish.
- Supabase SQL privilege checks: anon/authenticated cannot EXECUTE moderation RPCs; only service_role can. Private tables have RLS and no anonymous/authenticated SELECT grants.
- Nonexistent record decisions returned false without changes. Test HTTP requests with no session: review submit 401 SIGN_IN_REQUIRED; owner queue 503 OWNER_MODERATION_NOT_CONFIGURED (closed; owner identity not installed).
- No review rows were inserted, edited, auto-approved, rejected or deleted by test actions.

## Remaining blockers / not yet accepted
1. The *Testing* Auth project does not contain a confirmed `john@pepperjunction401.com` account. Production has one confirmed matching account (read-only verification), but Production was NOT modified. Owner UUID must be bound securely as `PJ_REVIEW_OWNER_USER_ID` in the appropriate environment; no UUID may be supplied by the web client.
2. Email delivery cannot run until a verified sender is configured in `PJ_REVIEW_ALERT_FROM` and `RESEND_API_KEY` is set as a private Edge Function secret. No email has been sent. Provider failure preserves the queue and records failure. Automatic retries/backfill are not yet installed.
3. Screening is an initial **deterministic ruleset**; nuanced harassment, evasion, semantic spam and exhaustive slur coverage require additional policy validation before production promotion. Do not claim complete semantic content moderation.
4. An actual new qualifying review → approved/frozen database transition and an authenticated owner decision have not yet been tested end-to-end because there are no isolated qualifying owner fixtures and the owner identity is not configured.
5. Production still has the existing pending Tears of the Sun review. Do not change its status until separately authorized promotion/repair.
6. A separate owner Go Ahead is required for selective Main/Production promotion. The protected Loyalty Bridge is not included.

## Scope of further tests
After configuring isolated Testing owner and outbound provider secrets, test one clean qualifying submission, one flagged qualifying submission, one owner queue decision, one failed notification, and verify no changes to earned Review Board slot credits. Use independent test fixtures instead of modifying real customer data.
