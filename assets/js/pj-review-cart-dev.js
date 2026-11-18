/* Review Board → Pepper Junction's existing cart, LOCAL TESTING ONLY.
 * The real cart owns the $0 reward line, not an alternate checkout button.
 * Server validates the reward, the paid lines, and Square payment.
 */
(function () {
  'use strict';
  var host = location.hostname.toLowerCase();
  if (host !== 'localhost' && host !== '127.0.0.1') return;
  var cart = window.PJCart, review = window.PJReviewData;
  var button = document.getElementById('pj-cart-page-checkout');
  var summaryBox = document.querySelector('.pj-cart-page-summary-box');
  if (!cart || !button || !summaryBox) return;
  var params = new URLSearchParams(location.search);
  var raw = params.get('reviewRewardRow');
  var saved = null;
  try { saved = sessionStorage.getItem('pj_review_cart_row'); } catch (_) {}
  var pending = cart.getReviewRewardCheckoutPending();
  var rowNumber = raw && /^[1-9][0-9]*$/.test(raw) ? Number(raw) :
    pending && Number.isInteger(pending.row_number) ? pending.row_number :
    saved && /^[1-9][0-9]*$/.test(saved) ? Number(saved) : null;
  var existing = cart.getReviewReward();
  if (!rowNumber && existing) rowNumber = existing.reward_row_number;
  if (!rowNumber) return;

  // Never start a live transaction or trust a URL parameter as entitlement.
  button.disabled = true;
  button.hidden = true;
  var section = document.createElement('section');
  section.id = 'pj-review-cart-reward';
  section.setAttribute('role', 'status');
  section.style.cssText = 'margin:14px 0;padding:14px;border:1px solid #d8b45d;border-radius:8px;background:#203522;color:#f5e6c8;';
  var heading = document.createElement('strong');
  heading.textContent = 'Review Board Complimentary Product';
  var status = document.createElement('p');
  status.textContent = 'Verifying earned reward in Supabase Testing…';
  var defer = document.createElement('button');
  defer.type = 'button';
  defer.textContent = 'Save Reward for Later';
  defer.style.cssText = 'margin:8px 0;padding:8px;color:#f1cc78;background:transparent;border:1px solid #d8b45d;cursor:pointer;';
  defer.hidden = true;
  var link = document.createElement('a');
  link.href = 'passenger-station.html#board';
  link.textContent = 'Return to Review Board';
  link.style.cssText = 'display:block;color:#f1cc78;margin-top:8px;';
  section.append(heading,status,defer,link);
  summaryBox.insertBefore(section,button);

  function paidCount() {
    return cart.getSummary().items.filter(function(item) {
      return item.kind !== 'pj_review_reward';
    }).length;
  }
  function resetIntent() {
    try { sessionStorage.removeItem('pj_review_cart_row'); } catch (_) {}
    try {
      var u = new URL(location.href);
      u.searchParams.delete('reviewRewardRow');
      history.replaceState(null,'',u.pathname+u.search+u.hash);
    } catch (_) {}
  }
  function updateButton() {
    var reward = cart.getReviewReward();
    var hasPaid = paidCount() > 0;
    button.hidden = !reward;
    button.disabled = !reward || !hasPaid;
    button.textContent = 'Checkout Now';
    defer.hidden = !reward || !!cart.getReviewRewardCheckoutPending();
    if (!reward) return;
    status.textContent = reward.product_name +
      ' · $0.00 in your Pepper Junction cart. ' +
      (hasPaid ? 'Your paid products remain unchanged.' :
      'Add at least one paid product to redeem this reward.');
  }
  defer.addEventListener('click',function(){
    if (cart.getReviewRewardCheckoutPending()) return;
    var reward=cart.getReviewReward();
    if (reward) cart.removeItem(reward.product_id);
    resetIntent();
    button.hidden = true; // localhost never falls through to Production checkout
    status.textContent='Your earned selection remains saved on the Review Board for a future paid order.';
    defer.hidden=true;
  });
  if (!review || typeof review.getReviewBoard !== 'function') {
    status.textContent='Review Board verification is unavailable. Checkout remains locked.';
    return;
  }
  review.getReviewBoard().then(function(board){
    var row=(board.rows||[]).find(function(r){return r.rowNumber===rowNumber;});
    if (row && row.entitlementStatus==='redeemed') {
      var reward=cart.getReviewReward();
      if(reward)cart.removeItem(reward.product_id);
      resetIntent();
      status.textContent='This Review Board reward has already been redeemed.';
      return;
    }
    if (!row || row.achieved!==true || row.entitlementStatus!=='selected' ||
        !row.selectedProductSlug) {
      status.textContent='An earned, selected Review Board reward is required. Checkout remains locked.';
      return;
    }
    var load=review.loadCatalog().catch(function(){return null;});
    return load.then(function(){
      var info=review.getProduct(row.selectedProductSlug);
      cart.setReviewReward(rowNumber,{
        slug:row.selectedProductSlug,
        name:info&&info.name,
        brand:info&&info.brand
      });
      try { sessionStorage.setItem('pj_review_cart_row',String(rowNumber)); } catch (_) {}
      if (pending) {
        if (pending.row_number!==rowNumber) {
          status.textContent='Another reward order is awaiting payment confirmation.';
          button.disabled=true;
          return;
        }
        var returned = params.get('orderId');
        if (returned && returned!==pending.order_id) {
          status.textContent='Square returned a different order. No reward has been redeemed.';
          button.disabled=true;
          return;
        }
        button.hidden=true;
        status.textContent='Verifying the pending Square Sandbox payment…';
        return cart.verifyReviewRewardSandboxPayment().then(function(){
          resetIntent();
          status.textContent='Square payment verified. Review Board reward redeemed once.';
          button.hidden=true;
          defer.hidden=true;
        }).catch(function(){
          status.textContent='Payment not verified. Your paid cart and $0 reward remain intact. Return to this page after completing the Sandbox payment.';
          button.hidden=true;
          defer.hidden=true;
        });
      }
      updateButton();
    });
  }).catch(function(error){
    status.textContent='Unable to verify your Review Board reward. Checkout remains locked.';
    console.warn('Review Board cart verification failed:',error);
  });
  window.addEventListener(cart.event,function(){
    if (cart.getReviewReward() && !pending) updateButton();
  });
})();
