# G9 State Entry Badges — Scoped Main and Production Promotion Record

**Owner directive:** Promote only G9, explicitly excluding **ALL frozen Loyalty Badge and PJ Credits work, including shared-file changes**. Never blanket-merge Sauce-Bar-Dev.

## Result — Successful

**Date:** November 7, 2026 (Eastern; some Supabase migrations recorded November 8 UTC).

- G9-only release branch: `release/g9-state-only-20261107`, created from existing `main` commit `5f508218284228d3f8fc796a8a8e95098c674f46`.
- Strict release-candidate gate: [GitHub Actions #42441907293](https://github.com/pepperjunction401-beep/sauce-bar/actions/runs/42441907293), **all green** (G9-only source isolation, actual candidate Edge source unit tests, Chromium State Depot, Chromium post-payment retry). **Temporary test harness files and the temporary workflow were deleted from the release branch after the passing run.**
- Scoped PR: [#34](https://github.com/pepperjunction401-beep/sauce-bar/pull/34) — **merged** to lowercase `main` using squash; new Main SHA **`79f320e8e796ab1096fd463e8c827c4925b39e90`**.
- Post-merge compare verified **exactly six** file paths changed; the frozen Loyalty Bridge markup in `passenger-station.html` is byte-for-byte identical to the original Main. No `pj_loyalty_my_collection`, PJ Credits balance renderer, account onboarding, Netlify, product, cart, importer, or Railroad changes were merged.
- GitHub Pages [build and deployment #42442167327](https://github.com/pepperjunction401-beep/sauce-bar/actions/runs/42442167327) — **build, report and deploy all succeeded**. No separate authenticated live browser shopping test has been run.

## Exact six-file Main manifest

1. `passenger-station.html` — selectively assembled G9-only Census State section, State collection RPC/level styling, earned-only division-secret presentation, and iframe readiness; **Loyalty section and functionality preserved from Main, unchanged**.
2. `assets/js/post-payment-badges.js` — exact two-hunk Dev G9-only `state_processing` and customer **Check Again** integration; preexisting celebration/cart logic unchanged.
3. `supabase/functions/post-payment-awards-read/index.ts` — existing Production source + G9 purchase-attributed State award and earned secret projection; existing origin allowlist and JWT preserved; **Testing localhost exception NOT included**.
4. `supabase/migrations/20261106141500_g9_state_badge_isolated_foundation.sql` — additively creates six G9 tables, 50-State/9-division registry, queue, evaluator/reconciler and purchase enqueue trigger.
5. `supabase/migrations/20261106194000_g9_state_queue_ordering_and_indexes.sql` — G9 indexes/worker ordering.
6. `supabase/migrations/20261106225000_g9_state_depot_customer_projection.sql` — authenticated user-specific `pj_state_my_collection()`.

**Not in the release:** all PJ Credits/Loyalty/legacy-loyalty SQL, functions, UI, enrollment, background jobs, test programs, and Square or Railroad modifications. All unrelated Dev changes remain in Sauce-Bar-Dev.

## Supabase Production G9 deployment

Production project `cdbenwthxhypuuipyjlv`.

### Applied exactly three migrations

- `20261108031707_g9_state_badge_foundation_20261107`
- `20261108031709_g9_state_queue_ordering_indexes_20261107`
- `20261108031711_g9_state_depot_collection_20261107`

Installed independently of all other Testing migrations. Post-install read-only counts: **50 registry states, 9 divisions, 0 evaluation queue, 0 earned credits, 0 customer State levels, 0 earned secrets**, and the preexisting **6 purchase records unchanged**.

### Existing Post-Payment Edge Function

`post-payment-awards-read` updated from Production version 2 to **version 3**, `ACTIVE`, `verify_jwt=true`. Exact server entrypoint matches G9-only release branch, with Production-origin CORS unchanged; preexisting `progress.js` and `deno.json` unchanged.

### Dedicated Production worker

Created `pj-g9-state-worker-production` with cron job ID **3**, running `select public.pj_state_process_queue(50);` every minute. Read-only post-install check: **active**, two recorded successful runs and zero failures at verification. Does not invoke `pj_state_reconcile_queue`.

### Security advisors

Supabase security advisor lists informational `rls_enabled_no_policy` for the six new G9 tables, **intentional by design**: direct `anon`/ordinary `authenticated` SELECT/WRITE permissions are revoked. A warning for `pj_state_my_collection()` as an authenticated `SECURITY DEFINER` function is also expected: it is the deliberately scoped, `auth.uid()`-derived customer projection with account-verification checks. G9 Tests 2 and 5 had validated scope, customer isolation and permissions. No security warning was “fixed” by broadening authorization.

## Historical and Test 7 boundaries

**No historic purchase sweep or reconciliation was executed.** Before release the read-only Production inventory found **five candidate purchases** since October 8, 2026; these were left untouched and unawarded. They will require a separately authorized small reconciliation. No refunds/returns were reversed.

**No real-money Square transaction or Test 7** was initiated. That final owner-led live payment-to-award acceptance remains **pending separate authorization**.

No additional source changes or bug patches were made to other badge families, Square, Checkout, Railroad or PJ Credits.

## Recovery guidance — requires owner authorization to execute

1. If harmful, **disable only** `pj-g9-state-worker-production` (e.g. `select cron.unschedule('pj-g9-state-worker-production');`), not unrelated scheduled jobs.
2. If necessary, disable **only** G9's `pj_state_purchase_enqueue` trigger after assessing any already accepted payments; do not change purchase acceptance or Railroad.
3. Restore Main's previous website files from commit `5f508218284228d3f8fc796a8a8e95098c674f46` via separately reviewed narrow revert, not a Dev merge; restore the prior server Edge Function v2 source from the same Main baseline if indicated.
4. Leave any earned customer data in place; never automatically delete or reverse awards, purchases, credits, loyalty, identity records, or merchandise history.
5. The G9 migrations are additive, but no separate external database backup was created through the available tools. Any database-level restoration must be planned and approved separately.

## Open presentation item

Nine division-secret custom illustration assets remain outstanding; earned-only text/★ fallback is functional and no unearned secrets are revealed.

**Status: G9 scoped Main + Production promotion complete; Test 7 and historical reconciliation intentionally pending owner action.**
