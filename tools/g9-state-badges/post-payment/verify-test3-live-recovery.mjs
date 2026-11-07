/**
 * G9 Test 3: real Testing Auth, deployed Edge, Dev post-payment page left open
 * throughout pending -> failed/backoff -> recovered award. No Square traffic.
 * Operator creates/removes the ONLY purchase fixture in isolated Testing SQL.
 */
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import {createReadStream,existsSync,statSync,readFileSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {createClient} from '@supabase/supabase-js';
import {chromium} from 'playwright';
if(process.env.G9_TEST3_ACK!=='SUPERVISED_TESTING_ONLY_CLEANUP')
  throw Error('Explicit supervised Testing-only fixture acknowledgment required');
const root=process.cwd(),testId='slubpfmpjgoupujptayy';
const host='https://'+testId+'.supabase.co';
const authSource=readFileSync(resolve('assets/js/pj-auth.js'),'utf8');
const m=authSource.match(/isLocalDev\s*\?\s*'(sb_publishable_[^']+)'/);
if(!m||!authSource.includes(testId))throw Error('Testing Auth guard failed');
const email='g9-test3-'+randomUUID()+'@pepperjunction401.com';
const password='G9!'+randomBytes(28).toString('base64url');
const auth=createClient(host,m[1],{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const {data:created,error:signupError}=await auth.auth.signUp({email,password});
if(signupError||!created?.user?.id)throw Error('Isolated Test3 signup failed: '+signupError?.message);
const uid=created.user.id,order='G9_TEST3_'+uid.replaceAll('-','');
console.log('TEST3 USER ID: '+uid);
console.log('TEST3 EMAIL: '+email);
console.log('TEST3 ORDER: '+order);
console.log('OPERATOR STEP A: confirm this user and set ONLY its Testing customer_profiles.account_state=verified_matched');
let loggedIn=false;
for(let i=0;i<70;i++){
 const {data,error}=await auth.auth.signInWithPassword({email,password});
 if(!error&&data?.session?.access_token){
  const {data:coll,error:collError}=await auth.rpc('pj_state_my_collection');
  if(!collError&&coll?.status==='verified'){loggedIn=true;break}
 }
 await new Promise(done=>setTimeout(done,4000));
}
if(!loggedIn)throw Error('Fixture not verified in time; operator cleanup required');
console.log('PASS genuine Testing Auth and verified identity');
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const server=createServer((req,res)=>{
 let path;try{path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname))}catch{res.writeHead(400);return res.end()}
 if(!path.startsWith(root+sep)||!existsSync(path)||!statSync(path).isFile()){res.writeHead(404);return res.end()}
 res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});
 createReadStream(path).pipe(res);
});
await new Promise((ok,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',ok)});
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
let page;
try{
 const context=await browser.newContext();
 page=await context.newPage();
 await page.route('**/*',route=>{
  const u=route.request().url();
  if(u.startsWith(origin+'/')||u.startsWith(host+'/')||u.startsWith('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/'))return route.continue();
  return route.abort();
 });
 await page.addInitScript(({order})=>{
   sessionStorage.setItem('pj_checkout_pending',JSON.stringify({order_id:order,cart_snapshot:'isolated-only'}));
 },{order});
 await page.goto(origin+'/post-payment-badges-testing.html',{waitUntil:'domcontentloaded'});
 await page.locator('#postpay-test-auth-form input[name="email"]').fill(email);
 await page.locator('#postpay-test-auth-form input[name="password"]').fill(password);
 await page.locator('#postpay-test-auth-form button[type="submit"]').click();
 await page.waitForFunction(()=>{
  const t=document.querySelector('#postpay-awards-message')?.textContent||'';
  return t.includes('not been attached in isolated Testing');
 },null,{timeout:35000});
 assert.equal(await page.locator('#earned-badge-grid .pj-award-card').count(),0);
 console.log('PASS browser open; absent purchase pending, no fabricated award');
 console.log('OPERATOR STEP B: insert ONLY synthetic completed/attached RI purchase with this order and set its G9 queue status=failed, attempts=1, next_attempt_at=now()+interval 1 hour');
 let foundFailed=false;
 for(let i=0;i<85;i++){
  await page.locator('#postpay-awards-retry').click();
  await page.waitForTimeout(500);
  const status=await page.locator('#postpay-awards-message').textContent();
  if(status.includes('State Badge processing is still finishing')){
    foundFailed=true;
    assert.equal(await page.locator('#earned-badge-grid .pj-award-card').count(),0);
    assert.equal(await page.locator('#postpay-awards-retry').isVisible(),true);
    // Recheck while still failed: never create an award.
    await page.locator('#postpay-awards-retry').click();
    await page.waitForTimeout(600);
    assert.equal(await page.locator('#earned-badge-grid .pj-award-card').count(),0);
    console.log('PASS real completed checkout with failed/delayed G9 queue, page still open, no badge, Check Again visible');
    break;
  }
  await page.waitForTimeout(3500);
 }
 if(!foundFailed)throw Error('Did not observe queued but unawarded real checkout');
 console.log('OPERATOR STEP C: make FAILED G9 job due and run the EXISTING pj_state_process_queue(1), with no direct award inserts');
 let earned=false;
 for(let i=0;i<85;i++){
  await page.locator('#postpay-awards-retry').click();
  await page.waitForTimeout(650);
  const cards=page.locator('#earned-badge-grid .pj-award-card');
  if(await cards.count()===1){
    assert.match(await cards.first().textContent(),/Rhode Island/);
    assert.match(await cards.first().textContent(),/Level 1/);
    assert.equal(await page.locator('#postpay-awards-retry').isVisible(),false);
    earned=true;
    console.log('PASS same open page Check Again reveals actual RI Level 1 once worker recorded it');
    break;
  }
  await page.waitForTimeout(3500);
 }
 if(!earned)throw Error('Worker completion/Dev page award not observed');
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelectorAll('#earned-badge-grid .pj-award-card').length===1,null,{timeout:35000});
 assert.equal(await page.locator('#earned-badge-grid .pj-award-card').count(),1);
 const {data:actual,error:actualError}=await auth.functions.invoke('post-payment-awards-read',{body:{square_order_id:order}});
 assert.equal(actualError,null);
 assert.equal(actual.state_processing,'complete');
 assert.equal(actual.awards.filter(x=>x.family==='state_entry').length,1);
 assert.equal(actual.awards.find(x=>x.family==='state_entry')?.level,1);
 console.log('PASS refresh remains exactly one verified checkout award; no browser invoked G9 evaluator');
 console.log('G9 TEST3 LIVE BROWSER PASS: user, pending checkout, failed queue, existing worker recovery, same-page retry, refresh.');
 await context.close();
}finally{
 await browser.close();
 await new Promise(done=>server.close(done));
 await auth.auth.signOut().catch(()=>{});
}
console.log('MANUAL CLEANUP REQUIRED: exact disposable Auth, synthetic purchase, State credit/level/queue, Passenger queue.');
