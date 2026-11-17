// Isolated deterministic Square Sandbox order-shape regression — no Square calls or credentials.
import assert from 'node:assert/strict';
const discount='PJ_REVIEW_FREE',reward='TEST_REWARD',paid='TEST_PAID';
const line=(id,net,discountAmount=0,applied=false)=>({
 catalog_object_id:id,quantity:'1',total_money:{amount:net},
 total_discount_money:{amount:discountAmount},
 applied_discounts:applied?[{discount_uid:discount}]:[]
});
function acceptable(order,paidCount=1){
 const lines=order?.line_items||[];
 const isReward=l=>l.applied_discounts?.some(d=>d.discount_uid===discount);
 const free=lines.filter(l=>l.catalog_object_id===reward&&isReward(l));
 const normal=lines.filter(l=>!isReward(l));
 return free.length===1&&free[0].quantity==='1'&&free[0].total_money?.amount===0&&
  normal.length===paidCount&&normal.every(l=>l.total_money?.amount>0&&
   Number(l.total_discount_money?.amount||0)===0)&&Number(order.total_money?.amount)>0;
}
const testCases=[
 ['one paid one free',true,[line(paid,999),line(reward,0,1299,true)],999],
 ['same variation paid and free',true,[line(reward,1299),line(reward,0,1299,true)],1299],
 ['discount leaked to paid',false,[line(paid,799,200),line(reward,0,1299,true)],799],
 ['free item charged',false,[line(paid,999),line(reward,1,1298,true)],1000],
 ['only free item',false,[line(reward,0,1299,true)],0],
 ['duplicate reward lines',false,[line(paid,999),line(reward,0,1299,true),line(reward,0,1299,true)],999],
 ['wrong discount uid',false,[line(paid,999),{...line(reward,0,1299,true),applied_discounts:[{discount_uid:'OTHER'}]}],999]
];
for(const [name,expected,line_items,amount] of testCases){
 assert.equal(acceptable({line_items,total_money:{amount}}),expected,name);
 console.log('PASS:',name);
}
console.log('7/7 simulated Square order-shape tests passed; no network or purchase.');