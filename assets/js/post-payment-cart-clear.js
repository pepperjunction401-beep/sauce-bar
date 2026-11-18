// Square return is NOT payment proof. The existing purchase ledger must
// confirm an order before its matching Pepper Junction cart is cleared.
// A Review Board reward also requires authenticated, server-verified
// Square payment and atomic entitlement redemption in the SAME checkout service.
(function(){
  'use strict';
  var pending;
  try { pending=JSON.parse(sessionStorage.getItem('pj_checkout_pending')||'null'); }
  catch(_){return;}
  if(!pending||typeof pending.order_id!=='string'||typeof pending.cart_snapshot!=='string')return;
  var base='https://cdbenwthxhypuuipyjlv.supabase.co/functions/v1/';
  function confirmReviewReward() {
    if(!pending.reward_row_number) return Promise.resolve(true);
    var row=Number(pending.reward_row_number);
    if(!Number.isInteger(row)||row<1) return Promise.reject(Error('Invalid reward row'));
    var auth=window.PJAuth;
    if(!auth||!auth.enabled||!auth.client)
      return Promise.reject(Error('Review Board sign-in required'));
    return auth.verifiedUser().then(function(user){
      if(!user) throw Error('Review Board sign-in required');
      return auth.client.auth.getSession();
    }).then(function(result){
      var token=result&&result.data&&result.data.session&&result.data.session.access_token;
      if(!token) throw Error('Review Board session unavailable');
      return fetch(base+'square-checkout',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
        credentials:'omit',cache:'no-store',
        body:JSON.stringify({
          action:'confirm_review_reward',
          row_number:row,
          square_order_id:pending.order_id
        })
      });
    }).then(function(response){
      return response.json().then(function(data){
        if(!response.ok||data.status!=='redeemed') throw Error('Reward payment verification incomplete');
        return true;
      });
    });
  }
  fetch(base+'checkout-order-confirmed',{
    method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',cache:'no-store',
    body:JSON.stringify({square_order_id:pending.order_id})
  }).then(function(r){if(!r.ok)throw Error('Not confirmed');return r.json();})
  .then(function(data){
    if(!data.confirmed) return false;
    // The normal paid-only checkout follows its existing confirmation flow.
    return confirmReviewReward();
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
    // Never auto-redeem or clear a cart when either verification fails.
    if(pending.reward_row_number) console.warn('Review Board reward confirmation pending:',error);
  });
})();
