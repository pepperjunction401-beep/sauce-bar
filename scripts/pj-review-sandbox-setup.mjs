/**
 * Pepper Junction — one-time Review Board Square Sandbox setup.
 * Usage: node scripts/pj-review-sandbox-setup.mjs
 * Env vars: SQUARE_SANDBOX_ACCESS_TOKEN, SQUARE_SANDBOX_LOCATION_ID,
 *           SUPABASE_TESTING_SERVICE_KEY.
 * Never use Production credentials. No payment, customer, or Production changes.
 */
const BASE='https://connect.squareupsandbox.com';
const TEST='https://slubpfmpjgoupujptayy.supabase.co';
const token=process.env.SQUARE_SANDBOX_ACCESS_TOKEN;
const location=process.env.SQUARE_SANDBOX_LOCATION_ID;
const secret=process.env.SUPABASE_TESTING_SERVICE_KEY;
if(!token||!location||!secret){
 console.error('MISSING_SANDBOX_CONFIGURATION: no changes made.');
 process.exitCode=2;
}else{
 const request=async(url,opts)=>{
  const r=await fetch(url,opts);
  const result=await r.json().catch(()=>({}));
  if(!r.ok)throw Error('Sandbox setup HTTP '+r.status+' '+JSON.stringify(result.errors||result));
  return result;
 };
 const square=(method,path,body)=>request(BASE+path,{method,headers:{
  Authorization:'Bearer '+token,'Square-Version':'2026-09-16',
  'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const db=(method,path,body)=>request(TEST+'/rest/v1/'+path,{method,headers:{
  apikey:secret,...(secret.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+secret}),
  'Content-Type':'application/json',Prefer:'return=representation'},
  body:body?JSON.stringify(body):undefined});
 try{
  const locations=await square('GET','/v2/locations');
  if(!locations.locations?.some(x=>x.id===location))
   throw Error('Sandbox location does not match the Sandbox account');
  const rows=await db('GET','pj_review_sandbox_catalog?select=product_id,fixture_role,square_sandbox_item_id,square_sandbox_variation_id,sandbox_verified_at');
  if(rows.length!==2||new Set(rows.map(r=>r.fixture_role)).size!==2)
   throw Error('Exactly one reward and one paid fixture required');
  const specs={reward:{price:1299,key:'pj-review-sandbox-reward-v1'},
               paid:{price:999,key:'pj-review-sandbox-paid-v1'}};
  for(const row of rows.sort((a,b)=>a.fixture_role.localeCompare(b.fixture_role))){
   const spec=specs[row.fixture_role];
   if(!spec)throw Error('Unexpected fixture role');
   let item,variation;
   if(row.sandbox_verified_at){
    item=(await square('GET','/v2/catalog/object/'+encodeURIComponent(row.square_sandbox_item_id))).object;
    variation=item?.item_data?.variations?.find(v=>v.id===row.square_sandbox_variation_id);
   }else{
    const id='#PJREVIEW'+row.fixture_role.toUpperCase();
    const data=await square('POST','/v2/catalog/object',{
     idempotency_key:spec.key,
     object:{id,type:'ITEM',item_data:{
      name:'Pepper Junction Sandbox '+row.fixture_role+' test',product_type:'REGULAR',
      variations:[{id:id+'V',type:'ITEM_VARIATION',item_variation_data:{
       item_id:id,name:'One test item',pricing_type:'FIXED_PRICING',
       price_money:{amount:spec.price,currency:'USD'}
      }}]
     }}
    });
    item=data.catalog_object;
    variation=item?.item_data?.variations?.[0];
    const verified=(await square('GET','/v2/catalog/object/'+encodeURIComponent(item.id))).object;
    if(!verified?.item_data?.variations?.some(v=>v.id===variation?.id))
     throw Error('Square returned an unverified catalog variation');
   }
   if(!item?.id||!variation?.id||
      variation.item_variation_data?.price_money?.amount!==spec.price)
    throw Error('Sandbox item/price mismatch for '+row.fixture_role);
   const path='pj_review_sandbox_catalog?product_id=eq.'+encodeURIComponent(row.product_id)+
      '&fixture_role=eq.'+encodeURIComponent(row.fixture_role);
   const saved=await db('PATCH',path,{
    square_sandbox_item_id:item.id,
    square_sandbox_variation_id:variation.id,
    expected_price_cents:spec.price,
    sandbox_verified_at:new Date().toISOString()
   });
   if(saved.length!==1)throw Error('Fixture row not updated exactly once');
   console.log('Verified Square Sandbox '+row.fixture_role+' item');
  }
  console.log('READY: two isolated Square Sandbox catalog items. No payments made.');
 }catch(err){console.error('SANDBOX_SETUP_FAILED:',err.message);process.exitCode=1;}
}