// Square return is NOT payment proof. The existing purchase ledger must
// confirm an order before its matching Pepper Junction cart is cleared.
// Reward redemption is completed by the existing verified-purchase importer.
// The browser only checks the read-only confirmed order state.
(function(){
  'use strict';
  var pending;
  try { pending=JSON.parse(sessionStorage.getItem('pj_checkout_pending')||'null'); }
  catch(_){return;}
  if(!pending||typeof pending.order_id!=='string'||typeof pending.cart_snapshot!=='string')return;
  var localDev=location.hostname==='localhost'||location.hostname==='127.0.0.1';
  var base='https://'+(localDev?'slubpfmpjgoupujptayy':'cdbenwthxhypuuipyjlv')+
    '.supabase.co/functions/v1/';
  fetch(base+'checkout-order-confirmed',{
    method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',cache:'no-store',
    body:JSON.stringify({square_order_id:pending.order_id,
      reward_row_number:pending.reward_row_number||null})
  }).then(function(r){if(!r.ok)throw Error('Not confirmed');return r.json();})
  .then(function(data){
    if(!data.confirmed) return false;
    // The confirmation endpoint checks both paid purchase and reward state.
    return true;
  }).then(function(confirmed){
    if(confirmed!==true) return;
    var current=sessionStorage.getItem('pj_checkout_pending');
    if(!current)return;
    var latest;try{latest=JSON.parse(current);}catch(_){return;}
    if(latest.order_id!==pending.order_id)return;
    // Never discard an edited cart or new purchases.
    if(sessionStorage.getItem('pj_cart')===pending.cart_snapshot){
      sessionStorage.removeItem('pj_cart');
      window.dispatchEvent(new CustomEvent('pj-cart-updated'));
    }
    sessionStorage.removeItem('pj_checkout_pending');
    if(pending.reward_row_number){
      try {sessionStorage.removeItem('pj_review_cart_row');}catch(_){}
    }
  }).catch(function(error){
    // Never auto-redeem or clear the cart on an unconfirmed purchase.
    if(pending.reward_row_number) console.warn('Review Board order confirmation pending:',error);
  });
})();
