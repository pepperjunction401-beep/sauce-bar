// Pepper Junction unified Review Board checkout — static architecture regression gate.
// Read-only, dependency-free: node scripts/pj-review-unified-checkout-guard.mjs
// This does NOT prove live Square payment, deployments, inventory or UI behavior.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const cart = read('assets/js/cart-engine.js');
const adapter = read('assets/js/pj-review-cart-dev.js');
const board = read('assets/js/pj-review-board-live.js');
const cartPage = read('cart-page.html');
const checkout = read('supabase/functions/square-checkout/index.ts');
const postpay = read('assets/js/post-payment-cart-clear.js');
const service = read('supabase/functions/pj-review-service/index.ts');
const finalize = read('supabase/sql/pj_review_reward_atomic_verified_redemption.sql');
const reserve = read('supabase/sql/pj_review_reward_atomic_selection_reservation.sql');
const runtime = [cart, adapter, board, cartPage, checkout, postpay, service];
const checks = [
  ['original PJCart checkout preserved', cart.includes('function startCheckout()')],
  ['original Square checkout endpoint preserved', cart.includes('functions/v1/square-checkout')],
  ['parallel client checkout removed', !runtime.some(s => s.includes('startReviewRewardCheckout'))],
  ['parallel Sandbox endpoint absent from active runtime', !runtime.some(s => s.includes('pj-review-sandbox-checkout'))],
  ['old parallel checkout source absent', !existsSync(new URL('../supabase/functions/pj-review-sandbox-checkout/index.ts', import.meta.url))],
  ['reward is separate zero-price cart line', cart.includes("kind: 'pj_review_reward'") && cart.includes('price: 0, quantity: 1')],
  ['paid cart items share native checkout payload', cart.includes('paid_item_count') && cart.includes('payload.review_reward')],
  ['local Testing cannot open Production checkout', cart.includes('Live checkout is disabled in isolated local Testing.')],
  ['Review Board opens native cart', board.includes('cart-page.html') && board.includes('reviewRewardRow')],
  ['cart adapter verifies Board selection', adapter.includes('review.getReviewBoard()') && adapter.includes('cart.setReviewReward(')],
  ['cart page loads existing cart engine', cartPage.includes('assets/js/cart-engine.js')],
  ['server checks authenticated identity', checkout.includes('admin.auth.getUser(bearer)')],
  ['server checks reward entitlement and row slot', checkout.includes('pj_review_reward_entitlements') && checkout.includes('pj_review_board_slots')],
  ['Square line-level reward discount checked', checkout.includes('PJ_REVIEW_FREE') && checkout.includes('/v2/orders/calculate')],
  ['single existing Square payment-link creator retained', (checkout.match(/\/v2\/online-checkout\/payment-links/g) || []).length === 1],
  ['verified payment precedes reward finalization', checkout.includes('payment.status !== "COMPLETED"') && checkout.lastIndexOf('pj_review_reward_finalize_verified_order') > checkout.lastIndexOf('payment.status !== "COMPLETED"')],
  ['ledger check occurs before reward finalization on return', postpay.indexOf('checkout-order-confirmed') < postpay.indexOf('return confirmReviewReward()')],
  ['cart snapshot safeguarded on Square return', postpay.includes('pending.cart_snapshot')],
  ['atomic entitlement RPC preserved', finalize.includes('pj_review_reward_finalize_verified_order')],
  ['atomic checkout reservation RPC preserved', reserve.includes('pj_review_reward_reserve_checkout')],
];
let failed = 0;
for (const [name, passed] of checks) {
  if (!passed) failed++;
  console.log((passed ? 'PASS' : 'FAIL') + ' ' + name);
}
assert.equal(failed, 0, failed + ' architectural checks failed');
console.log(checks.length + '/' + checks.length + ' static architecture checks passed. No writes, network calls, payments or deployments.');
