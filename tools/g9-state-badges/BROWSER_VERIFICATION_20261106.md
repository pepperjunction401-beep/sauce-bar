# G9 — Badge Depot Chromium verification
**Date:** November 6, 2026 (GitHub Actions ran November 7 UTC)  
**Branch:** Sauce-Bar-Dev  
**Supabase:** Isolated Testing only; no database writes in this browser regression.

## Test method
The checked-in `tools/g9-state-badges/browser/verify-depot.mjs` launches headless Chromium on GitHub Actions Ubuntu 24.04, serves the actual `passenger-station.html` and its first-party source files from the checked-out Dev branch, and supplies a **mock** Supabase client with simulated signed-in users and award responses.

All external network calls are blocked (including live Square/Production). This is **browser-rendering verification with a simulated session**, *not* a real Supabase-authenticated browser E2E test.

## Defect discovered and corrected
**Finding:** The Depot adapter sometimes treated the embedded iframe's initial `about:blank` document as ready because `contentDocument.readyState==='complete'`, painting an empty document. When the actual iframe `srcdoc` loaded afterward, the original showroom states remained, including two misleading preview-unlocked State cards.

**Dev-only correction:** `passenger-station.html` now waits until the embedded document actually contains `#states .coin-flip-card` before painting, keeps the iframe hidden until verified presentation is ready, and listens for the real iframe load event. The badge engine, authenticated projection, and other family's award rules were not changed.

**Commit:** `2bf086f856f01ddf499c6cf112a40654908309e3` in Sauce-Bar-Dev.

## Final browser results
GitHub Actions workflow `G9 State Depot isolated browser regression`, run `42316920821`: **SUCCESS, 5 of 5 tests passed**.

1. **PASS** — Verified simulated account shows Rhode Island earned at Level 5, the unlock hint disappears, unearned Connecticut remains locked, and earned-card enlarge/flip behavior works.
2. **PASS** — Earned-only New England division secret is displayed; unearned division names remain absent.
3. **PASS** — `identity_not_verified` response leaves **all 50** State cards locked, no secret awards shown.
4. **PASS** — Failed/unavailable State RPC leaves **all 50** State cards locked while the existing Depot opens.
5. **PASS** — No signed-in session redirects to first-party `account.html?return=station`.

All tests blocked external HTTP and used no live customer account.

**Workflow:** `.github/workflows/g9-state-depot-browser.yml` (triggered on changes to `passenger-station.html`, browser test code, or workflow). Pinned to Ubuntu 24.04 for Playwright 1.57.0 compatibility.

## Remaining boundary
The genuine signed-in browser check using a verified-matched isolated Supabase Testing account and real Testing State awards remains **unverified**: Testing had two auth users, but zero verified-matched customers and zero State award rows. Do not mislabel the simulated Chromium test as a genuine authenticated end-to-end pass. A controlled first-party Testing sign-in session and award fixture are required for that final check.

**Scope safeguards:** No Main/Production deployment, Production database write, live Square charge, customer account mutation, or Netlify use.

*Question everything. Challenge each other.*
