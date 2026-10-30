// Square return is not itself payment proof. Clear only the exact cart sent
// for an order that the production purchase ledger confirms was completed.
(function(){
 'use strict';
 var pending;
 try { pending=JSON.parse(sessionStorage.getItem('pj_checkout_pending')||'null'); }catch(_){return;}
 if(!pending||typeof pending.order_id!=='string'||typeof pending.cart_snapshot!=='string')return;
 fetch('https://cdbenwthxhypuuipyjlv.supabase.co/functions/v1/checkout-order-confirmed',{
   method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',cache:'no-store',
   body:JSON.stringify({square_order_id:pending.order_id})
 }).then(function(r){if(!r.ok)throw Error('Not confirmed');return r.json();})
 .then(function(data){
   if(!data.confirmed)return;
   var current=sessionStorage.getItem('pj_checkout_pending');
   if(!current)return;
   var latest;try{latest=JSON.parse(current);}catch(_){return;}
   if(latest.order_id!==pending.order_id)return;
   // Never destroy a cart that was edited after opening Square checkout.
   if(sessionStorage.getItem('pj_cart')===pending.cart_snapshot){
     sessionStorage.removeItem('pj_cart');
     window.dispatchEvent(new CustomEvent('pj-cart-updated'));
   }
   sessionStorage.removeItem('pj_checkout_pending');
 }).catch(function(){/* Keep pending cart intact when payment is unconfirmed. */});
})();