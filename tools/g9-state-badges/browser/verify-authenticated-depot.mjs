// Isolated G9 State Depot real-auth/browser verification.
// IMPORTANT: This test runs only against the Supabase Testing project, never Production.
// A synthetic, disposable email/password is generated at runtime (never committed).
// Human/automation operator confirms it and seeds an earned State level via Testing SQL.
// This check does not create any purchases or call Square.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const TESTING='slubpfmpjgoupujptayy';
const host='https://'+TESTING+'.supabase.co';
const root=process.cwd();
const authSource=readFileSync(resolve(root,'assets/js/pj-auth.js'),'utf8');
const m=authSource.match(/isLocalDev\s*\?\s*'(sb_publishable_[^']+)'/);
if(!m || !authSource.includes(TESTING)) throw Error('Testing-only publishable key/host contract changed');
const publishable=m[1];
const email='g9-browser-'+randomUUID()+'@pepperjunction401.com';
const password='G9!'+randomBytes(24).toString('base64url');
const adminless=createClient(host,publishable,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
});
console.log('G9 test target: Supabase isolated Testing only');
console.log('G9 test account: '+email+' (disposable; credentials generated at runtime)');
let signup;
try {
 signup=await adminless.auth.signUp({email,password});
 if(signup.error || !signup.data?.user?.id) throw Error('Testing Auth signUp: '+String(signup.error?.message||'no user'));
} catch(e) {
 console.error('SIGNUP FAILED (no browser test run): '+String(e));
 process.exit(1);
}
const fixtureId=signup.data.user.id;
console.log('G9 disposable fixture user ID: '+fixtureId);
console.log('G9 awaiting Testing-only confirmation and verified RI Level 5 fixture. No passwords logged.');
let sessionReady=false;
const start=Date.now();
for(let attempt=1;attempt<=45;attempt++){
 const {data,error}=await adminless.auth.signInWithPassword({email,password});
 if(!error && data.session?.access_token){
   const awards=await adminless.rpc('pj_state_my_collection');
   if(!awards.error&&awards.data?.status==='verified'&&Array.isArray(awards.data.states)&&
     awards.data.states.some(s=>s.state_code==='RI'&&s.level===5)){
      sessionReady=true;
      console.log('G9 authenticated Testing fixture ready (verified profile, RI Level 5).');
      break;
   }
 }
 await new Promise(done=>setTimeout(done,8000));
 if(attempt%4===0)console.log('G9 awaiting isolated test fixture: '+Math.round((Date.now()-start)/1000)+'s');
}
if(!sessionReady){
 console.error('G9 real-auth test NOT RUN: timed out awaiting isolated Testing fixture. Disposable user requires cleanup.');
 process.exit(2);
}
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const server=createServer((req,res)=>{
  let p;
  try{p=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));}catch{res.writeHead(400);return res.end()}
  if(!p.startsWith(root+sep)||!existsSync(p)||!statSync(p).isFile()){
    res.writeHead(404);return res.end();
  }
  res.writeHead(200,{'Content-Type':types[extname(p)]||'application/octet-stream','Cache-Control':'no-store'});
  createReadStream(p).pipe(res);
});
await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes)});
const port=server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
let passed=false;
try {
 const context=await browser.newContext();
 const page=await context.newPage();
 const blocked=new Set();
 await page.route('**/*',async route=>{
   const u=route.request().url();
   if(u.startsWith('http://127.0.0.1:'+port+'/')||
       u.startsWith(host+'/')||
       u.startsWith('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/'))
      return route.continue();
   // Do not load assets from the live Pepper Junction domain or any other origin.
   blocked.add(new URL(u).origin);
   return route.abort();
 });
 await page.goto('http://127.0.0.1:'+port+'/account.html',{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>Boolean(window.PJAuth?.enabled && window.PJAuth?.client),null,{timeout:30000});
 const signIn=await page.evaluate(async ({email,password})=>{
   const {data,error}=await window.PJAuth.client.auth.signInWithPassword({email,password});
   return {id:data?.user?.id||null,error:error?.message||null};
 },{email,password});
 assert.equal(signIn.error,null,'actual Supabase Auth password sign-in must succeed');
 assert.equal(signIn.id,fixtureId);
 const verified=await page.evaluate(async()=>({
   user:(await window.PJAuth.verifiedUser())?.id||null,
   awards:await window.PJAuth.client.rpc('pj_state_my_collection')
 }));
 assert.equal(verified.user,fixtureId,'PJAuth must verify user against Testing Auth');
 assert.equal(verified.awards.error,null);
 assert.equal(verified.awards.awards,undefined);
 assert.equal(verified.awards.data.status,'verified');
 assert.equal(verified.awards.data.states.find(x=>x.state_code==='RI')?.level,5);
 console.log('PASS: real first-party PJAuth sign-in and customer-scoped G9 RPC');

 await page.goto('http://127.0.0.1:'+port+'/passenger-station.html',{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>{
   const p=document.getElementById('pj-depot-award-status');
   return p&&p.textContent?.startsWith('Your Badge Depot');
 },null,{timeout:40000});
 assert.equal(await page.locator('#frame-depot').isVisible(),true);
 const frame=page.frameLocator('#frame-depot');
 const states=frame.locator('#states .coin-flip-card');
 assert.equal(await states.count(),50);
 assert.equal(await frame.locator('#states .census-region-heading').count(),4);
 assert.equal(await frame.locator('#states .census-division-heading').count(),9);
 const card=(name)=>frame.locator('#states .coin-flip-card').filter({has:frame.locator('.coin-badge-name:text-is("'+name+'")')});
 const ri=card('Rhode Island'),ct=card('Connecticut'),ar=card('Arkansas'),la=card('Louisiana');
 assert.equal(await ri.count(),1);
 assert.equal(await ar.count(),1);
 assert.equal(await la.count(),1);
 assert.equal(await ri.evaluate(e=>e.classList.contains('unearned')),false);
 assert.equal((await ri.locator('.coin-level').textContent()).trim(),'Lvl 5');
 assert.equal(await ri.locator('.coin-level').isVisible(),true);
 assert.equal(await ct.evaluate(e=>e.classList.contains('unearned')),true);
 assert.equal(await ct.locator('.coin-level').isVisible(),false);
 assert.equal(await frame.locator('#pj-earned-state-divisions').count(),0);
 await ri.click();
 assert.equal(await ri.evaluate(e=>e.classList.contains('pj-expanded')),true);
 await ri.click();
 assert.equal(await ri.evaluate(e=>e.classList.contains('pj-flipped')),true);
 await ct.click();
 assert.equal(await ct.evaluate(e=>e.classList.contains('pj-expanded')),false);
 console.log('PASS: real authenticated Depot shows RI Level 5 and 50 states/4 regions/9 divisions');
 console.log('PASS: unearned States locked; no unearned secrets; earned badge flip works');
 console.log('G9 browser network guard blocked external origins: '+[...blocked].join(', '));
 passed=true;
 await context.close();
} finally{
 await browser.close();
 await new Promise(done=>server.close(done));
}
if(!passed)process.exitCode=1;
