# G9 Test 5 — Customer ownership, JWT, origin and direct-access security

**Date:** November 7, 2026  
**Environment:** GitHub `Sauce-Bar-Dev` and isolated Supabase Testing `slubpfmpjgoupujptayy`.  
**Status:** **PASS at tested scopes**; one revoked real-user session remains untested.  
**No application/engine changes, schema changes, Main merge, Production, Square, or importer operations.**

## 1. Real deployed isolated Testing endpoint — 17/17 PASS

[Successful HTTP security run #42349360824](https://github.com/pepperjunction401-beep/sauce-bar/actions/runs/42349360824)  
Script: `tools/g9-state-badges/tests/verify-test5-deployed-http.mjs`

Requests were issued over real HTTPS to the deployed Testing `post-payment-awards-read` function and read-only Data API surfaces, with no valid customer secrets or writes.

- Missing bearer → HTTP **401**, no awards
- Bad-signature bearer → HTTP **401**, no awards
- Untrusted cross-origin bearer → HTTP **401**, no awards
- Untrusted CORS preflight → HTTP **403**, no Access-Control-Allow-Origin
- Testing-localhost preflight → HTTP **204**, but subsequent anonymous POST still blocked
- Unsupported GET and anonymous order enumeration → no awards
- All **six G9 tables**: anonymous REST SELECT blocked (HTTP **401** each)
- All **four tested G9 RPCs**, including `pj_state_my_collection` and evaluator/worker functions: anonymous REST calls blocked (HTTP 401 or 404)

**Scope caveat:** Without a valid authorized user session, gateway-level JWT validation intercepts many HTTP requests before they reach the function body. The live HTTP checks therefore do not establish the handler's behavior under a valid but revoked user or malformed order with valid credentials.

The deployed function was verified **version 4**, `verify_jwt=true`, with exact source match to the Dev Edge function.

## 2. Actual G9 database ownership and role privilege tests — PASS

Rollback-only SQL: `tools/g9-state-badges/tests/test5_security_customer_isolation_rollback.sql`

A temporary verified owner, verified second customer, and unverified guest were created and awarded seven real G9 State credits through the existing G9 worker, yielding one earned New England secret.

- Owner's authenticated collection returned **six earned New England State badges and the one earned division secret**, nothing extra.
- Other customer returned **only Arkansas**, with zero division secrets.
- Unverified guest received `identity_not_verified` and two empty collection arrays.
- Changing the original owner's matched profile to `verified_unmatched` immediately concealed the collection without revoking its earned rows.
- Missing Auth claim raised the expected authorization error.
- All six G9 State tables had RLS **enabled**, and ordinary `anon` and `authenticated` roles had **no direct read or write grants**.
- G9 evaluator and queue-worker functions are not executable by anonymous or ordinary authenticated roles; the one read-only customer projection is available to authenticated users.

Every Auth, Profile, Purchase, award, queue, and unrelated trigger effect was rolled back in the test statement.

## 3. Actual Edge source ownership/fail-closed regression — 17/17 PASS

[Successful Edge-source/browser regression #42349459608](https://github.com/pepperjunction401-beep/sauce-bar/actions/runs/42349459608)  
Script: `tools/g9-state-badges/post-payment/verify-server-g9.mjs` (runs actual Dev TypeScript through an in-memory, query-only Supabase client), plus unchanged Chromium presentation regression **8/8 PASS**.

- Forged body `customer_id` does not override JWT-derived customer ID.
- Unowned order returns the same `pending` response as an unavailable order; neither State awards nor secret metadata leak.
- An authenticated user with a mismatched/unverified Phase 1 profile gets 403 before purchase lookup.
- A completed but unattached order yields no awards.
- Invalid Square order reference (short, traversal syntax, unsupported characters, overlong, blank) returns HTTP 400 before database reads.
- Previously earned awards, cross-purchase division secrets, failed/pending State processing, and previous checkout identities never leak into another checkout response.
- No `INSERT`, `UPDATE`, `DELETE`, checkout mutation, evaluator/worker call, or Square call made by the read-only Edge source.

**Honest boundaries:** These server-source scenarios use controlled fake Auth identities and an in-memory query client. They verify the real handler's owner checks and query shapes, not the state of a revoked real Supabase Auth session.

## Readiness and remaining scope

**Security tests passed:** G9 owner-isolation, anonymous and bad-JWT rejection, anti-enumeration, JWT-derived identity and matching profile gate, account privacy, purchase acceptance gate, malformed references, G9 REST/RPC privilege barriers, earned-only secrets.

**Not run:** A real post-revocation/expired-but-once-valid token probe, or cross-user endpoint call with two simultaneously authenticated Testing users. Such scenarios require separate authorized real Testing Auth sessions. Existing Test 1 did confirm genuine valid-user Testing login and same-owner checkout award retrieval; Test 5 separately tested genuine database isolation and actual HTTP invalid-token rejection. Do not represent the combination as one full live cross-account E2E.

**Next:** Test 6 of 7 — operational worker scheduling, reconciliation idempotence, October 8 cutoff, initial inventory/replay rehearsal and rollback planning in isolated Testing. Test 7 remains an owner-authorized real Square paid checkout after a separate Main/Production approval.

**Main/Production/Square/Importer/Railroad remain untouched.**
