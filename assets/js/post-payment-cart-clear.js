// A Square redirect is not payment proof. Clear only a cart whose exact order
// has been confirmed in the purchase ledger, and only if the cart is unchanged.
(function () {
  'use strict';
  var pending;
  try { pending=JSON.parse(sessionStorage.getItem('pj_checkout_pending')||'null'); }
  catch (_) { return; }
  if (!pending || typeof pending.order_id!=='string' ||
      typeof pending.cart_snapshot!=='string') return;

  var attempt=0, maxAttempts=12, retryDelay=2000;
  function checkOrder() {
    var active;
    try { active=JSON.parse(sessionStorage.getItem('pj_checkout_pending')||'null'); }
    catch (_) { return; }
    if (!active || active.order_id!==pending.order_id) return;

    fetch('https://cdbenwthxhypuuipyjlv.supabase.co/functions/v1/checkout-order-confirmed', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      credentials:'omit',cache:'no-store',
      body:JSON.stringify({square_order_id:pending.order_id})
    }).then(function(r) {
      if (!r.ok) throw new Error('Order confirmation unavailable');
      return r.json();
    }).then(function(data) {
      if (!data || data.confirmed!==true) { retry(); return; }

      var latest;
      try { latest=JSON.parse(sessionStorage.getItem('pj_checkout_pending')||'null'); }
      catch (_) { return; }
      if (!latest || latest.order_id!==pending.order_id) return;

      sessionStorage.setItem('pj_postpay_confirmed_order',pending.order_id);
      if (sessionStorage.getItem('pj_cart')===latest.cart_snapshot) {
        sessionStorage.removeItem('pj_cart');
        window.dispatchEvent(new CustomEvent('pj-cart-updated'));
      }
      sessionStorage.removeItem('pj_checkout_pending');
      window.dispatchEvent(new CustomEvent('pj-postpay-order-confirmed',
        {detail:{orderId:pending.order_id}}));
    }).catch(function(){ retry(); });
  }
  function retry() {
    attempt++;
    if (attempt<maxAttempts) setTimeout(checkOrder,retryDelay);
    // Pending checkout/cart remain intact if the ledger cannot confirm.
  }
  checkOrder();
})();
