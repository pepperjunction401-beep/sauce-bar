# Pepper Junction — Auth CAPTCHA activation gate
Date: 2026-11-16 · Branch: Sauce-Bar-Dev ONLY

## Purpose
Defend the existing Phase 1 email/password registration pipeline from automated account signups and transactional-email bounce abuse without changing customer identity, Square purchase matching, Badge Depot, or Loyalty Bridge.

## Scope
- `account.html`: Turnstile client challenge for **Create Account**, **Sign In**, and **Send Password Reset Email**.
- Tokens are passed using the existing Supabase Auth JavaScript `captchaToken` options.
- Token is reset after every attempt; stale/expired/unavailable challenges fail closed in the browser.
- No edge function, database migration, customer account deletion, or alternative authentication architecture.
- No secrets in the repository.

## Keys and environments
- **Sauce-Bar-Dev / localhost**: Cloudflare's *public testing* sitekey `1x00000000000000000000AA`. This is not protection by itself; testing-only Supabase project must use the matching test SECRET entered privately in Testing > Authentication > Bot and Abuse Protection. Do not commit any secret.
- **Production domain**: `liveTurnstileSiteKey` is intentionally empty in the Dev code. Register a real Cloudflare Turnstile widget for `pepperjunction401.com` and `www.pepperjunction401.com`; replace this empty public sitekey in the Dev file *before* approval to promote. Configure the real Turnstile **secret** privately in Production Supabase only as the coordinated final cutover.
- NEVER publish the dummy key as a live-sitekey, use testing secrets in Production, or enable Production Auth CAPTCHA before the corresponding published live page carries the real sitekey/token for every auth flow.

## Test & release gates
1. Run static checks and local browser checks against Sauce-Bar-Dev + Supabase **Testing**, not Production.
2. In Testing, activate CAPTCHA with Cloudflare test secret and verify: registration without token blocked (direct Auth API), valid test token reaches Auth, sign-in and reset flows require and carry tokens, errors/reset/expired tokens prompt retry, existing approved account sign-in works.
3. Confirm the live production sitekey is assigned and allowed hostnames correct; replace the empty public key on Dev only.
4. Owner explicitly authorizes Dev → Main promotion. **Never** promote without owner's "Go Ahead".
5. After Main is live and validated, owner explicitly authorizes matching Production Supabase server-side CAPTCHA enforcement. Verify unauthenticated signups without tokens are rejected and real sign-up, sign-in, reset succeed. Ensure a rollback procedure is ready.
6. Separately investigate Supabase mail bounces / custom SMTP if needed; CAPTCHA prevents a major source of abuse but is not an email-delivery solution.

## Safety
UI-only validation cannot protect public Auth endpoints. Do not claim the vulnerability is remediated until the **Production** Supabase CAPTCHA provider is turned on and tested.
Main and Production must remain unchanged until explicit release authorization.
