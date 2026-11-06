# G9 Stage D — Badge Depot connection implementation and testing
**Date:** November 6, 2026  
**Authorized scope:** `Sauce-Bar-Dev` and isolated Supabase Testing ONLY.  
**Not authorized:** Main, Production, post-payment integration, automatic historical reconciliation.

## Changes
1. `supabase/migrations/20261106225000_g9_state_depot_customer_projection.sql` — read-only, authenticated customer-scoped `pj_state_my_collection()` projection. Reads adjudicated `pj_state_customer_levels` and earned `pj_state_secret_awards` only; does not evaluate purchases or award anything. Returns only the verified customer's earned states and earned division secrets. Nonverified account yields `identity_not_verified` with empty arrays. Anonymous `EXECUTE` revoked.
2. `passenger-station.html` — existing Badge Depot loader now includes `pj_state_my_collection` as optional family query, leaving all existing indexes and unrelated badge families intact. The 50 State cards illuminate only from verified G9 records, show actual levels, and conceal unlock text on earned cards. Unverified/unavailable data leaves State cards locked, and no hardcoded State `Lvl 1` is shown when unearned. Earned division secret awards appear in a text-only card group after State section, with no unearned secret placeholders and no invented image paths.

## Isolated tests
- [PASS] Unverified customer receives no awards.
- [PASS] Verified customer receives one earned Rhode Island State Level 1, authentic registry art path, and no unearned secrets.
- [PASS] An artificially inserted earned secret is returned, not inferred by the reader.
- [PASS] Another customer has no access to the first customer's records.
- [PASS] All synthetic writes rolled back: 0 purchases, 0 State credits, 0 levels, 0 secrets and 0 jobs remain in isolated Testing.
- [PASS] Authenticated function execution permitted; anonymous execution denied.
- [PASS] GitHub Dev readback: 50 unique State cards, 4 Census regions, 9 divisions, one G9 projection query, specific State display and secrets branches.
- [NOTE] Supabase security advisor lists the authenticated SECURITY DEFINER RPC as intentional review item. Its response is confined by `auth.uid()` and verified-matched state; direct table grants were not opened.

## Remaining
- End-to-end signed-in browser rendering under local first-party Dev with a verified Testing account was not exercised; SQL projection and GitHub source checks passed.
- Production deploy is **not** authorized. Production lacks this new G9 RPC, so a live domain opening an undeployed Dev branch would leave G9 locked, preserving existing award families.
- Nine State-division secret art files do not exist; text-only earned visual is intentionally temporary, with owner artwork to be provided separately.
- Post-payment awards integration not touched.
- G9 backend is not historically backfilled; Production initial reconciliation needs its own authorization before rollout.

**Main/Production unchanged.**
