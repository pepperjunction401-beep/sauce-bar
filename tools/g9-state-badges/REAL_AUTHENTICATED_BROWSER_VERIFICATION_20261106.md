# G9 — Genuine Supabase Testing authentication and browser verification

**Executed:** November 6, 2026 Eastern / November 7, 2026 UTC  
**Environment:** `Sauce-Bar-Dev` plus isolated Supabase Testing (`slubpfmpjgoupujptayy`)  
**GitHub Actions:** [Successful real-auth browser run 42322683658](https://github.com/pepperjunction401-beep/sauce-bar/actions/runs/42322683658)

## Scope and proof

Unlike the earlier mock-session Chromium regression, this test used a **real Supabase Testing Auth password login and a real user-scoped G9 RPC**.

The workflow generated a unique disposable email under the Pepper Junction domain and a random password entirely at runtime. The password was never committed or printed in logs. After signup, the test identity alone was confirmed and marked `verified_matched` in isolated Testing. A temporary `pj_state_customer_levels` fixture set Rhode Island to Level 5. **No purchase or Square order was inserted**, no Square API was called, and no other award family was changed.

The browser used the real Dev `account.html`, `pj-auth.js`, `passenger-station.html`, and Supabase JS client on localhost. Only localhost, the isolated Testing Supabase host, and the public Supabase JS dependency CDN could be accessed; other destinations, including `pepperjunction401.com`, were blocked.

## Results — PASS

1. **PASS:** Real `auth.signInWithPassword()` via the Dev first-party auth client and identity verification with `PJAuth.verifiedUser()`.
2. **PASS:** Authenticated `pj_state_my_collection()` returns only the signed-in Testing customer's verified State award fixture.
3. **PASS:** Embedded Badge Depot visibly loads all **50 State cards, 4 Census regions, and 9 divisions**.
4. **PASS:** Earned Rhode Island displays **Level 5**; unearned Connecticut stays locked, hides static Level 1 and does not flip.
5. **PASS:** Existing badge enlarge and flip interactions work for an earned State.
6. **PASS:** No unearned division secrets are displayed.
7. **PASS:** Arkansas and Louisiana cards are present.
8. **PASS:** Real G9 reader, browser document timing, and iframe award adapter work together, not merely simulated responses.

## Cleanup

After the successful browser run, the single disposable RI Level 5 fixture was removed and the unique disposable Auth user was deleted in isolated Testing. Follow-up checks:

- Auth users: **2** (original count).
- Customer profiles: **2** (original count).
- Remaining G9 test accounts: **0**.
- State customer levels, purchase credits, secret awards and purchase rows: **0**.

No real customer identity, Production purchase, Main branch, or Production Supabase project was modified.

## Test harness protection

- The workflow `.github/workflows/g9-state-depot-real-auth.yml` was returned to **manual-only**; automatic push trigger disabled.
- `tools/g9-state-badges/browser/verify-authenticated-depot.mjs` has an explicit operator acknowledgment guard before creating any future test identity. No unattended disposable Auth users.
- The existing mocked Chromium browser regression remains installed and passing **5/5** on Dev.

## What this verifies — and what it does not

**Verified:** real Testing Auth session, authenticated G9 read-only award projection, customer-specific response, and actual Depot browser rendering and interactions.

**Not a claim of:** a real Square charge, purchase-import integration, automatic State-award calculation end-to-end, Production deployment, or post-payment award integration. The isolated fixture was a direct, controlled existing-award row created specifically to verify presentation; earlier G9 isolated evaluator/queue tests cover award processing separately.

**Main and Production untouched.**
