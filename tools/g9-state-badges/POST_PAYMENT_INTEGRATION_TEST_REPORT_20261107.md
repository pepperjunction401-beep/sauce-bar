# G9 — Post-Payment Awards integration and test record
**Date:** November 7, 2026  
**Authorized scope:** GitHub `Sauce-Bar-Dev`, isolated Supabase Testing `slubpfmpjgoupujptayy`.  
**Unchanged/off limits:** Main, Supabase Production, Square, Railroad, purchase importer, badge evaluators, other badge-family records.

## Changes made
1. Extended **existing** `supabase/functions/post-payment-awards-read/index.ts` (Dev commit `308039362a7517e28f7c2d54e6fdc6e020973c76`), deployed ONLY to isolated Testing as `post-payment-awards-read` **v4**, `verify_jwt=true`.
   - Authenticates actual Supabase user and verifies `customer_profiles.account_state='verified_matched'`; verifies a completed+attached purchase by `square_order_id` **and** authenticated `customer_id` before any award is returned (preexisting boundary retained).
   - Uses `pj_state_purchase_credits.purchase_id` and `customer_id` to read exact checkout State and **awarded_level**; joins registry for name and existing badge art.
   - Uses `pj_state_secret_awards.source_purchase_id` and `customer_id` to read only division secrets specifically awarded from that checkout; no unearned previews or invented art.
   - Adds `state_processing='pending'|'complete'` based only on authoritative G9 credit/queue state. Does not evaluate eligibility, initiate worker jobs, or query Square. A queue with no State credit and `status='done'` is complete without inventing an award; a pending/failed/held/missing queue with no credit remains pending.
   - Permits localhost origins ONLY if `SUPABASE_URL` equals the isolated Testing host. Retains Production's original origin restrictions.
2. Updated **existing** `assets/js/post-payment-badges.js` (Dev commit `8ceecc1862d2cddda2a28d8ea4a1d33f448d161e`):
   - Keeps the other families' verified cards visible while G9 remains pending and makes the existing **Check Again** control available until G9 processing completes.
   - Existing generic card rendering, event-attribution check, art adapters, checkout logic and progress computation remain unchanged.
3. Added two isolated regression harnesses and the Dev-only GitHub Actions workflow:
   - `tools/g9-state-badges/post-payment/verify-server-g9.mjs`
   - `tools/g9-state-badges/post-payment/verify-postpayment-browser.mjs`
   - `.github/workflows/g9-post-payment-regression.yml`

## Automated results — PASS
**[GitHub Actions run 42344494957](https://github.com/pepperjunction401-beep/sauce-bar/actions/runs/42344494957)**

**Server-source regression: 12/12**
- Exact checkout-only RI Level 5 with registry art; other checkout omitted.
- Repeat later checkout never re-celebrates earlier award.
- Wrong customer / unauthenticated / unowned order denied or pending.
- Untrusted origin denied; isolated localhost permitted.
- Unpaid or unattached order returns no awards.
- Pending/failed G9 worker does not create State awards; existing family awards persist.
- Completed worker without a credit yields no phantom award.
- Earned division secret displayed only on the originating checkout; different purchase excluded.
- Missing queue/credit evidence does not claim an award.
- No external HTTP calls, SQL mutation, or Square calls.

**Actual Dev HTML in Chromium with controlled function responses: 7/7**
- Correct RI Level 5 State card, title, flip interaction.
- Worker pending shows existing earned Heat badge plus **Check Again**; subsequent ready response shows both Heat and State.
- Earned-only division-completion secret uses a fallback, no invented artwork.
- Pending checkout displays no award.
- Wrong event ID is rejected (fail closed).
- Signed-out visitor sees no award, makes no award function request.
- Missing checkout order reference blocks award requests.

**Testing status after tests**
- Deployed Edge Function version **4**, JWT required; no new tables, schema migration, worker changes, or credentials.
- Auth users **2**, customer profiles **2**, purchases **0**, G9 purchase credits **0**, G9 secrets **0**, G9 queue **0** (unchanged).
- These are isolated source/Chromium tests with fixture responses. No real Supabase Testing purchase existed for this run. Do not call this an authenticated paid-checkout E2E verification.

## Remaining tests before authorization to release

### Required G9 acceptance tests
1. **Real authenticated Testing checkout-specific Edge integration:** Dedicated disposable Testing Auth user; controlled *completed/attached purchase* and normal G9 queue/worker, then invoke deployed Testing `post-payment-awards-read` with a real JWT; verify the same credit/level on Depot and post-payment, order ownership isolation, and scoped cleanup. The test must not involve an unauthorized Square Production call.
2. **Complete State/division matrix:** Validate all **50 states**, all nine division-completion secrets, exact final-state award checkout attribution, repeat purchases and unlimited level sequence, and absence of unearned secrets. Existing isolated backend tests cover a sampling, not an exhaustive real browser display for all nine secrets.
3. **True delayed/failed/recovered worker flow:** With actual Testing queue rows, ensure post-payment Check Again transitions from pending to ready, retains any other family awards, never duplicates, handles a temporarily failed/held queue and retries, and never calls the evaluator from the browser.
4. **Cross-family regression and browser coverage:** Confirm existing Heat/Food/Celestial/Shop O'Round/Coins/Purchase Progress/Milestone/Passenger award pathways are not regressed; check phone/tablet/desktop sizes, return-navigation authentication, card artwork and flip interactions, and checkout/cart-clearing behavior. No Production checkout or Netlify testing.
5. **Security/ownership against the deployed Testing endpoint:** Real authenticated cross-account order probes, signed-out or revoked sessions, malformed/forged Square order IDs, and origin restrictions; verify no State or secret metadata leakage, no direct G9 table read, no writes, and that a merely redirected/unpaid purchase is not awarded.
6. **Operational readiness/initial reconciliation:** Confirm worker cadence and monitoring, retry/reconciliation idempotence, 2026-10-08 cutoff and customer shipping-state evidence; read-only review of Production qualifying purchase inventory; rehearse controlled Oct-8-onward startup reconciliation against isolated fixtures, and document rollback. **No Production reconciliation without separate explicit owner authorization.**
7. **Controlled real paid-checkout acceptance:** After separate owner authorization for Production rollout and live purchase testing, prove one real Square-confirmed payment enters via the existing approved importer, G9 awards the customer once, and both Depot and post-payment present identical authoritative outcomes. Test a subsequent same-state order increments the level without recreating the first award.

### Visual decision, not an engine test
- The nine division secret illustration files are not yet present. Current awarded secret presentation is text/fallback only; obtain owner art/design approval before final release if artwork is required.

### Optional extra resilience
- Slow network, repeated refresh, two simultaneous client sessions/tabs, and rapid back-to-back checkout visual behavior under load. No new architecture justified by these unless testing demonstrates a defect.

## Stop line
**Main and Production remain completely untouched.** Passing these isolated regressions is not deployment authorization. Owner must explicitly approve any Dev → Main merge, Production migration, worker install, historical reconciliation, or paid live test.
