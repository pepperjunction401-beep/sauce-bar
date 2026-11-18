# Pepper Junction — Square Sandbox browser handoff/return verification

**Date:** November 17, 2026  
**Scope:** Sauce-Bar-Dev, Supabase Testing project `slubpfmpjgoupujptayy`, Square Sandbox. Main/Production not modified.

## Implemented
- `supabase/functions/pj-review-sandbox-checkout/index.ts`: the authenticated create action now validates a **local cart-page URL only** (`localhost` or `127.0.0.1`, HTTP(S), path exactly `/cart-page.html`, no query/fragment/userinfo) and supplies it to Square CreatePaymentLink as `checkout_options.redirect_url`. The normal Square shipping-address option remains set; Square owns shipping configuration.
- `assets/js/cart-engine.js`: reward checkout supplies the current local origin + `/cart-page.html` as `returnUrl`, retains pending order and paid cart snapshot.
- `assets/js/pj-review-cart-dev.js`: after a Square browser return, if `orderId` is present AND matches the pending order in that tab, it invokes the actual `verifyReviewRewardSandboxPayment` server pathway. The redirect itself is not payment evidence. Unpaid or mismatched returns do not redeem; manual verification remains accessible when Sandbox doesn't redirect.
- No changes to regular Production checkout, badge engine or frozen Loyalty Bridge/PJ Credits.

## Square API acceptance
- Square's real Sandbox API accepted a disposable paid-plus-$0.00-reward payment link with `redirect_url=http://localhost:8787/cart-page.html`.
- RetrievePaymentLink returned exactly that redirect and `ask_for_shipping_address=true`.
- Disposable link deleted; temporary Testing-only probe removed.
- Supabase Testing `pj-review-sandbox-checkout` redeployed from Dev source v25 ACTIVE.

## Simulated browser client tests (4/4 PASS)
| Case | Result |
|---|---|
| Matching browser `orderId`, verified payment | Calls verification once, marks redeemed, clears stored reward intent |
| Matching browser `orderId`, unpaid payment | Calls verification once, keeps reward pending and retry control visible |
| Mismatched `orderId` | No verification call, redemption blocked |
| No Square return parameters (Sandbox manual fallback) | Pending order remains ready for Verify Square Sandbox Payment |

## Limitations and next validation
- These client return-state tests are simulated DOM/browser harness tests, not a real hosted UI session.
- Square's Sandbox Payment Link Testing Panel historically cannot perform the exact real hosted payment-page/card-entry/automatic redirect flow; as of its October 2026 forum discussions, limitations remain uncertain. Thus the full live-browser hosted return is **not claimed verified**.
- A real logged-in localhost Sauce-Bar-Dev browser session is needed to check visible cart layout, navigation, Square Testing Panel and manual return. Do not use a public preview, Netlify or the Production domain for this test.
- Real Production checkout flow requires a separately approved controlled live payment test only if Sandbox cannot simulate it.
- Final order-content reconciliation against the original paid cart, as well as paid/free import into badges/PJ Credits, are outside this return-stage test and remain for later work.

## Safety
- All testing confined to Supabase Testing / Square Sandbox and Sauce-Bar-Dev.
- Main, Production, and frozen Loyalty Bridge work untouched.
- Payment link test created no real charge or shipping label.
