/**
 * G9 Test 1: genuine Supabase Testing Auth -> existing G9 purchase queue/worker
 * -> deployed post-payment Edge endpoint -> existing Dev celebration page + Depot.
 * Never calls Square. Creates only a disposable Testing Auth identity; the
 * operator provisions a synthetic purchase using Testing SQL after reading
 * the generated test order/id and performs explicit scoped cleanup afterward.
 */
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

if (process.env.G9_TEST1_OPERATOR_ACK !== 'AUTHORIZED_ISOLATED_TEST_WITH_MANUAL_CLEANUP') {
  throw Error('G9 Test 1 requires explicit operator authorization and supervised Testing SQL cleanup; refusing to create any account.');
}
const TESTING='slubpfmpjgoupujptayy';
const apiHost='https://'+TESTING+'.supabase.co';
const authSource=readFileSync(resolve('assets/js/pj-auth.js'),'utf8');
const testAuthSource=readFileSync(resolve('assets/js/post-payment-testing-auth.js'),'utf8');
const m=authSource.match(/isLocalDev\s*\?\s*'(sb_publishable_[^']+)'/);
if(!m||!authSource.includes(TESTING)||!testAuthSource.includes(TESTING))throw Error('Isolated Testing Auth client contract changed; abort');
const publishable=m[1];
const email='g9-test1-'+randomUUID()+'@pepperjunction401.com';
const password='G9!'+randomBytes(28).toString('base64url');
const supabase=createClient(apiHost,publishable,{auth:{
  persistSession:false,autoRefreshToken:false,detectSessionInUrl:false
}});
console.log('TEST TARGET: isolated Supabase '+TESTING+' / GitHub Sauce-Bar-Dev; NO Square, Main, Production');
console.log('TEST EMAIL (disposable): '+email);
const {data:signup,error:signupError}=await supabase.auth.signUp({email,password});
if(signupError || !signup?.user?.id)throw Error('Unable to create disposable Testing user: '+String(signupError?.message||'unknown'));
const fixtureId=signup.user.id;
const order='G9_TEST1_'+fixtureId.replaceAll('-','');
console.log('TEST SQUARE ORDER REFERENCE (synthetic, never sent to Square): '+order);
console.log('TEST USER ID: '+fixtureId);
console.log('TEST FIXTURE STEP A REQUIRED: confirm ONLY this Testing Auth email and mark ONLY this customer profile verified_matched.');
console.log('PASSWORD NEVER LOGGED. Do not insert a purchase until the initial pending response is confirmed.');

let signedIn=false,session;
for(let i=0;i<70;i++){
  const result=await supabase.auth.signInWithPassword({email,password});
  if(!result.error&&result.data?.session?.access_token){signedIn=true;session=result.data.session;break}
  await new Promise(done=>setTimeout(done,4000));
}
if(!signedIn)throw Error('Testing user was not confirmed in time. Test user requires scoped cleanup.');
console.log('PASS: genuine Testing password sign-in with disposable Auth identity');
const {data:collection,error:collectionError}=await supabase.rpc('pj_state_my_collection');
if(collectionError||collection?.status!=='verified')throw Error('Testing profile has not become verified_matched; no purchase was processed');
console.log('PASS: real authenticated and verified Testing customer context');

async function edge(orderRef){
 const {data,error}=await supabase.functions.invoke('post-payment-awards-read',{body:{square_order_id:orderRef}});
 if(error)throw Error('Deployed Testing post-payment Edge invocation failed: '+error.message);
 return data;
}
const initial=await edge(order);
assert.equal(initial.status,'pending','Unknown/unsigned purchase must remain pending');
assert.deepEqual(initial.awards,[]);
console.log('PASS: real Edge endpoint returns pending without a completed attached purchase');
console.log('TEST FIXTURE STEP B REQUIRED: insert the one synthetic completed/attached RI purchase with this order ref through the existing Testing purchase ledger and run the normal G9 worker.');
console.log('TEST INFO: user_id='+fixtureId+' order_ref='+order);

let matched=null;
for(let i=0;i<100;i++){
 const d=await edge(order);
 if(d?.status==='ready' && d.state_processing==='complete'){
   const awards=(d.awards||[]).filter(a=>a.family==='state_entry');
   if(awards.length!==1||awards[0].code!=='RI'||awards[0].level!==1||
      awards[0].attribution?.id!==order||awards[0].image!=='assets/badges/states/badges-states-rhode-island.png'){
      throw Error('Edge returned ready without exactly the expected purchase-scoped RI Level 1 award: '+JSON.stringify(d).slice(0,750));
   }
   matched=d;break;
 }
 await new Promise(done=>setTimeout(done,4000));
 if(i%10===9)console.log('AWAITING G9 worker and actual purchase evidence... '+(i+1)*4+' sec');
}
if(!matched)throw Error('G9 fixture not completed or reader did not return expected award; test fixture requires cleanup');
console.log('PASS: real deployed Edge endpoint displays only RI Level 1 from this completed/attached synthetic purchase');
const {data:depot,error:depotError}=await supabase.rpc('pj_state_my_collection');
assert.equal(depotError,null);
assert.equal(depot?.states?.find(x=>x.state_code==='RI')?.level,1);
console.log('PASS: real G9 Depot RPC agrees on earned RI Level 1');
const unrelated=await edge('G9_TEST1_UNRELATED'+randomUUID().replaceAll('-',''));
assert.equal(unrelated.status,'pending');
assert.deepEqual(unrelated.awards,[]);
console.log('PASS: same customer cannot claim the earned RI award for an unrelated checkout');

const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const root=process.cwd();
const server=createServer((req,res)=>{
 let p;try{p=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname))}catch{res.writeHead(400);return res.end()}
 if(!p.startsWith(root+sep)||!existsSync(p)||!statSync(p).isFile()){
   res.writeHead(404);return res.end();
 }
 res.writeHead(200,{'Content-Type':types[extname(p)]||'application/octet-stream','Cache-Control':'no-store'});
 createReadStream(p).pipe(res);
});
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok)});
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext();
 const page=await context.newPage();
 const blockedOrigins=new Set();
 await page.route('**/*',async route=>{
   const u=route.request().url();
   if(u.startsWith(base+'/')||u.startsWith(apiHost+'/')||
      u.startsWith('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/'))return route.continue();
   try{blockedOrigins.add(new URL(u).origin)}catch{}
   return route.abort();
 });
 await page.addInitScript(({order})=>{
   try{sessionStorage.setItem('pj_checkout_pending',JSON.stringify({order_id:order,cart_snapshot:'g9-fixture-test-only'}))}catch{}
 },{order});
 await page.goto(base+'/post-payment-badges-testing.html',{waitUntil:'domcontentloaded',timeout:35000});
 const form=page.locator('#postpay-test-auth-form');
 await form.locator('input[name="email"]').fill(email);
 await form.locator('input[name="password"]').fill(password);
 await form.locator('button[type=submit]').click();
 await page.waitForFunction(()=>{
   const s=document.querySelector('#postpay-awards-message')?.textContent||'';
   return s.includes('These achievements were verified for this checkout.') ||
     s.includes('could not verify') || s.includes('Unable') || s.includes('temporarily unavailable');
 },null,{timeout:45000});
 const message=await page.locator('#postpay-awards-message').textContent();
 assert.match(message,/These achievements were verified for this checkout\./,
   'real Testing post-payment browser response should be verified');
 const awards=page.locator('#earned-badge-grid .pj-award-card');
 assert.equal(await awards.count(),1,'only this checkout State card');
 assert.match(await awards.first().textContent(),/Rhode Island/);
 assert.match(await awards.first().textContent(),/Level 1/);
 const img=awards.first().locator('img.pj-award-art');
 assert.match(await img.getAttribute('src'),/badges-states-rhode-island\.png$/);
 await awards.first().click();
 assert.equal(await awards.first().evaluate(x=>x.classList.contains('is-flipped')),true);
 assert.equal(await page.locator('#postpay-awards-retry').isVisible(),false);
 console.log('PASS: actual Dev post-payment test page, real Auth form and deployed Edge show one RI Level 1 with artwork and flip');

 await page.goto(base+'/account.html',{waitUntil:'domcontentloaded',timeout:35000});
 await page.waitForFunction(()=>window.PJAuth?.enabled&&window.PJAuth?.client,null,{timeout:20000});
 const auth=await page.evaluate(async({email,password})=>{
   const {data,error}=await window.PJAuth.client.auth.signInWithPassword({email,password});
   return {id:data?.user?.id||null,error:error?.message||null};
 },{email,password});
 assert.equal(auth.error,null);
 assert.equal(auth.id,fixtureId);
 await page.goto(base+'/passenger-station.html',{waitUntil:'domcontentloaded',timeout:35000});
 await page.waitForFunction(()=>document.querySelector('#pj-depot-award-status')?.textContent?.startsWith('Your Badge Depot'),null,{timeout:40000});
 const frame=page.frameLocator('#frame-depot');
 assert.equal(await frame.locator('#states .coin-flip-card').count(),50);
 const card=frame.locator('#states .coin-flip-card').filter({has:frame.locator('.coin-badge-name:text-is("Rhode Island")')});
 assert.equal(await card.count(),1);
 assert.equal(await card.evaluate(x=>x.classList.contains('unearned')),false);
 assert.equal((await card.locator('.coin-level').textContent()).trim(),'Lvl 1');
 const ct=frame.locator('#states .coin-flip-card').filter({has:frame.locator('.coin-badge-name:text-is("Connecticut")')});
 assert.equal(await ct.evaluate(x=>x.classList.contains('unearned')),true);
 console.log('PASS: actual Dev Badge Depot real Auth displays matching RI Level 1, other states locked');
 console.log('PASS: real Testing purchase ledger -> G9 worker -> Edge -> Post-Payment and Depot');
 console.log('Blocked off-limits external origins: '+[...blockedOrigins].join(', '));
 await context.close();
}finally{
 await browser.close();
 await new Promise(done=>server.close(done));
 await supabase.auth.signOut().catch(()=>{});
}
console.log('G9 TEST 1 SUCCESS. Disposable Auth user, purchase, queue and State award require scoped operator cleanup.');
