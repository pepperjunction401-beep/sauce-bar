# Pepper Junction — Square Loyalty recovery capture (Dev only)

## Mission
Capture Square's **existing outstanding balances**, lifetime totals, point-changing events, and reward records during the owner's short reactivation window. This is a **snapshot**, not a PJ Credits award or historical purchase replay.

## Preconditions
- Owner resumes Square Loyalty; program reports `ACTIVE`.
- A Square **production** token with `LOYALTY_READ` permission is supplied securely at execution time. Never store the token in GitHub or in output files.
- Execute on a trusted computer with Node 20+ and private local storage. Confirm the existing Square credentials have read permission before any collection.
- No changes to Main, Production, Square program configuration, Phase 1/2, badges, or PJ wallets are authorized by this Dev code.

## Operator commands (trusted terminal)
Set `SQUARE_LOYALTY_READ_TOKEN` securely in the terminal environment (do **not** paste it into ChatGPT or GitHub).
```bash
node tools/loyalty-capture/square-loyalty-capture.mjs --status
node tools/loyalty-capture/square-loyalty-capture.mjs --out=/PRIVATE/PATH/pepper-junction-loyalty-snapshot
```
- `--status` checks the program, and never captures.
- Running capture twice against the same output folder resumes or checks its pagination checkpoints; it does not repeat all pages.
- The private folder contains `manifest.json`, per-stream original Square response pages, and `review.json`. **Those files contain customer data.** Limit access and make an encrypted offline backup immediately.
- The utility makes only `GET /v2/loyalty/programs/main` and `POST` to Square's *search* endpoints for accounts, events, and rewards. No write or redemption endpoints are used.

## Reconciliation before migration
1. Confirm three streams finished, unique account/event/reward IDs, and expected membership count. Investigate duplicates, negative balances, missing customer IDs, and issued rewards.
2. Compare a sample of customer outstanding point balances to Square Dashboard.
3. Verify Square Customer ID against Phase 1's accepted customer identity. Never assign unmatched loyalty balances to an account by name or unverified phone alone.
4. Apply the owner-approved **275-credit ceiling** only in the *future transfer calculation*. Track above-cap accounts for owner's personal handling. The capture preserves original, uncapped values.
5. **Do not award historical purchase points again** for activity already represented in Square's outstanding balances; reconcile overlap before any wallet import.
6. A wallet import, transfer event type, cutoff, account claims, and historical earning boundary must be separately approved, tested in isolated Supabase Testing, and deployed through Dev → owner Go Ahead → Main.

## Current limits
- Square Loyalty is paused, so a live account retrieval cannot yet be validated.
- No live token is available through the current tools; this is a prepared standalone utility, **not** a completed extraction.
- Square searches are paginated; a report can be considered complete only when all three streams reach their final cursor and no duplicate IDs appear.
- The current utility does not automatically migrate anything into Supabase. That is intentional. Do not upload confidential snapshots to the source repository.
- All account point balances are snapshots at capture time. They are **not** computed as lifetime earnings minus redemptions; the source reported balance is authoritative.
