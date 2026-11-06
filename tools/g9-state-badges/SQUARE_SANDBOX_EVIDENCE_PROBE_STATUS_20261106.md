# PEPPER JUNCTION — G9 Square Sandbox verification boundary
**November 6, 2026 — Dev / isolated Supabase Testing only**

## Scope and authority
Owner accepted the recommendation to use a genuinely isolated Square Sandbox test path after Stages A–C. This does **not** authorize Main/Production, modifications to the existing Production-oriented Square intake, live Square transactions, or Stage D presentation integration.

## Inspection findings
- Supabase Testing project: `slubpfmpjgoupujptayy`.
- Existing `square-sandbox-match` uses `https://connect.squareupsandbox.com` and expects `SQUARE_SANDBOX_ACCESS_TOKEN`.
- Existing `square-current-transaction-ingest` (deployed v4) uses `https://connect.squareup.com` and expects `SQUARE_PRODUCTION_ACCESS_TOKEN` and the Production location. It was **not** changed.
- Isolated Testing has 66 existing product mappings, all of which must remain authoritative. Square Sandbox catalog IDs cannot be assumed to match Production Square IDs.
- At review: zero accepted purchases, no verified-matched PJ customers, no Square customer links, and zero State Badge awards.
- The State queue worker is still enabled in Testing.

## New Sandbox-only evidence probe
Code: `supabase/functions/g9-square-sandbox-evidence/index.ts`.
Deployed **only** to Supabase Testing as `g9-square-sandbox-evidence` v1, `verify_jwt=true`.

Behavior:
- Hard restricted to the exact isolated Testing Supabase hostname.
- Requires existing trusted backend service authorization before any Square call.
- Uses only `SQUARE_SANDBOX_ACCESS_TOKEN`, `SQUARE_SANDBOX_LOCATION_ID`, and `https://connect.squareupsandbox.com`.
- `preflight` verifies configured Sandbox location using Sandbox Locations API, returning a boolean and no secrets.
- `verify` accepts Square Sandbox `square_order_id` and `square_payment_id` and retrieves both from Square Sandbox.
- Enforces G9 fixture reference `PJ_G9_SANDBOX_TEST`, matching Sandbox location, completed payment, matching order identity and USD total, consistent Sandbox customer evidence, US shipment address/state, catalog line UID and catalog object identity.
- Returns only safe evidence, including destination state; never returns full addresses, tokens, or customer personal information.
- **No side effects**: no Square order/payment creations, no changes to Supabase purchases, no badge evaluation, no account changes, no Production communication.

## Validation performed
- Deployment verified ACTIVE v1 in isolated Supabase Testing; JWT verification enabled.
- Rechecked Testing DB: 0 purchases, 0 State credits, 0 queue items, 0 verified-matched accounts, 0 Square customer links, 1 active G9 queue worker.
- **Not performed**: Sandbox preflight invocation, Sandbox order/payment generation, real Sandbox payment verification, and Sandbox-confirmed purchase acceptance/State award. Tooling for secure function invocation and known-good Sandbox fixture identifiers are not currently present; do not manufacture such evidence or label this as an end-to-end PASS.

## Exact remaining gates
1. Confirm the Testing function has `SQUARE_SANDBOX_ACCESS_TOKEN` and `SQUARE_SANDBOX_LOCATION_ID` configured. Do not expose any secret value.
2. Obtain a genuine Square Sandbox test fixture under `PJ_G9_SANDBOX_TEST`, including Sandbox customer, catalog-backed line, matching Sandbox order/payment and US shipment destination. Do not use a Production payment.
3. Invoke the read-only probe with trusted backend authorization, inspect its `sandbox_payment_verified` result, and retain only non-sensitive evidence.
4. Before claiming **end-to-end State PASS**, design/review the controlled adapter that maps Sandbox catalog identity into **temporary isolated test mapping** without modifying the existing 66 canonical Production Square mappings, then use the existing accepted-purchase recorder + State evaluator and demonstrate exactly-once award. The adapter must be Sandbox-only, not a new Production Square ingestion architecture.
5. Remove sandbox fixtures and test rows, preserve the established G9 foundation and restore normal Testing worker schedule.

## Status
**READ-ONLY SANDBOX EVIDENCE PROBE DEPLOYED**; true Sandbox payment and purchase-to-State end-to-end test **NOT RUN**. No Main/Production/real Square actions.

*Question everything. Challenge each other.*
