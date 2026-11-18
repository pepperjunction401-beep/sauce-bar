/* Pepper Junction Review Board → native Pepper Junction Cart adapter.
 * This adapter verifies the selected reward and adds a $0 cart line only.
 * All transactions use PJCart.startCheckout → the existing square-checkout.
 * The award decision stays server-owned, and no payment service is created here.
 */
(function () {
  'use strict';
  var cart = window.PJCart, review = window.PJReviewData;
  var button = document.getElementById('pj-cart-page-checkout');
  var summaryBox = document.querySelector('.pj-cart-page-summary-box');
  if (!cart || !button || !summaryBox) return;

  var params = new URLSearchParams(location.search);
  var raw = params.get('reviewRewardRow');
  var saved = null;
  try { saved = sessionStorage.getItem('pj_review_cart_row'); } catch (_) {}
  var existing = cart.getReviewReward();
  var rowNumber = raw && /^[1-9][0-9]*$/.test(raw) ? Number(raw) :
    saved && /^[1-9][0-9]*$/.test(saved) ? Number(saved) :
    existing ? existing.reward_row_number : null;
  if (!rowNumber) return;

  // Fail closed until the review service validates the selected row.
  button.disabled = true;
  button.hidden = true;
  var section = document.createElement('section');
  section.id = 'pj-review-cart-reward';
  section.setAttribute('role', 'status');
  section.style.cssText = 'margin:14px 0;padding:14px;border:1px solid #d8b45d;border-radius:8px;background:#203522;color:#f5e6c8;';
  var heading = document.createElement('strong');
  heading.textContent = 'Review Board — Complimentary Product';
  var status = document.createElement('p');
  status.textContent = 'Checking your earned reward…';
  var defer = document.createElement('button');
  defer.type = 'button';
  defer.textContent = 'Save Reward for Later';
  defer.style.cssText = 'margin:8px 0;padding:8px;color:#f1cc78;background:transparent;border:1px solid #d8b45d;cursor:pointer;';
  defer.hidden = true;
  var link = document.createElement('a');
  link.href = 'passenger-station.html#board';
  link.textContent = 'Return to Review Board';
  link.style.cssText = 'display:block;color:#f1cc78;margin-top:8px;';
  section.append(heading, status, defer, link);
  summaryBox.insertBefore(section, button);

  function paidCount() {
    return cart.getSummary().paid_item_count || 0;
  }
  function resetIntent() {
    try { sessionStorage.removeItem('pj_review_cart_row'); } catch (_) {}
    try {
      var u = new URL(location.href);
      u.searchParams.delete('reviewRewardRow');
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (_) {}
  }
  function refreshButton() {
    var reward = cart.getReviewReward();
    if (!reward) return;
    button.hidden = false;
    button.disabled = paidCount() === 0;
    button.textContent = 'Checkout Now';
    defer.hidden = false;
    status.textContent = reward.product_name + ' — $0.00 in your Pepper Junction Cart. ' +
      (paidCount() ? 'Your paid items remain unchanged.' :
      'Add at least one paid item to redeem your reward.');
  }
  defer.addEventListener('click', function () {
    var reward = cart.getReviewReward();
    if (reward) cart.removeItem(reward.product_id);
    resetIntent();
    defer.hidden = true;
    button.hidden = false;
    button.disabled = paidCount() === 0;
    status.textContent = 'Reward saved for a later purchase; paid items remain in the cart.';
  });

  if (!review || typeof review.getReviewBoard !== 'function') {
    status.textContent = 'Reward verification unavailable. Checkout remains locked.';
    return;
  }
  review.getReviewBoard().then(function (board) {
    var row = (board.rows || []).find(function (r) { return r.rowNumber === rowNumber; });
    if (!row || row.achieved !== true || row.entitlementStatus !== 'selected' ||
        typeof row.selectedProductSlug !== 'string' || !row.selectedProductSlug) {
      if (existing) cart.removeItem(existing.product_id);
      resetIntent();
      status.textContent = 'An earned, selected Review Board reward is required. Checkout is locked until verified.';
      return;
    }
    return Promise.resolve(review.loadCatalog()).then(function () {
      var info = review.getProduct(row.selectedProductSlug);
      cart.setReviewReward(rowNumber, {
        slug: row.selectedProductSlug,
        name: info && info.name,
        brand: info && info.brand
      });
      try { sessionStorage.setItem('pj_review_cart_row', String(rowNumber)); } catch (_) {}
      refreshButton();
    });
  }).catch(function (error) {
    status.textContent = 'Reward verification failed. Checkout remains locked.';
    console.warn('Review Board cart reward verification failed:', error);
  });
  window.addEventListener(cart.event, function () {
    if (cart.getReviewReward()) refreshButton();
  });
})();
