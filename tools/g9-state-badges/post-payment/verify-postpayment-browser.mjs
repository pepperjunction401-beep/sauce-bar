/**
 * G9 checkout celebration browser regression.
 * Loads actual isolated test presentation, no Supabase/Square/Production HTTP.
 * Supabase calls are replaced with deterministic responses in Chromium.
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';

const root=process.cwd(),port=0;
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const server=createServer((req,res)=>{
 let path;try{path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname))}catch{return res.writeHead(400).end()}
 if(!path.startsWith(root+sep)||!existsSync(path)||!statSync(path).isFile())return res.writeHead(404).end();
 res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});
 createReadStream(path).pipe(res);
});
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok)});
const origin='http://127.0.0.1:'+server.address().port;
const order='G9TEST_ORDER_ABC123';
const event={type:'checkout',id:order};
const state={
  family:'state_entry',code:'RI',title:'Rhode Island',level:5,
  label:'State Entry Badge',image:'assets/badges/states/badges-states-rhode-island.png',
  frontNote:'State Entry · Level 5',
  attribution:event,description:'Your completed purchase advanced this State Entry Badge to Level 5.'
};
const secret={
  family:'state_division_secret',code:'new_england',
  title:'New England · Division Complete',label:'State Division Secret',
  fallback:'★',attribution:event
};
const heat={
  family:'heat_identity',code:'heat_identity_mild_l1',
  title:'Heat Identity Mild',label:'Heat Identity',attribution:event
};
let browser;
const results=[];
async function test(title,{authenticated=true,checkout=true,replies=[],verify}){
 const context=await browser.newContext();
 const page=await context.newPage();
 try{
  const responseList=replies.length?replies:[{status:'ready',event,awards:[state],nearMisses:[],state_processing:'complete'}];
  await page.route('**/*',route=>{
   const url=route.request().url();
   if(url.startsWith(origin+'/'))return route.continue();
   if(url.includes('cdn.jsdelivr.net/npm/@supabase/supabase-js@2/'))
    return route.fulfill({status:200,contentType:'application/javascript',body:'/* Supabase mocked by pre-page init */'});
   return route.abort();
  });
  await page.addInitScript(({order,authenticated,checkout,responseList})=>{
   if(checkout)sessionStorage.setItem('pj_checkout_pending',JSON.stringify({order_id:order,cart_snapshot:'fixture-only'}));
   let index=0;
   const client={
     supabaseUrl:'https://slubpfmpjgoupujptayy.supabase.co',
     auth:{
       getUser:async()=>({data:{user:authenticated?{id:'test-user',email_confirmed_at:'2026-11-06T00:00:00Z',is_anonymous:false}:null},error:null}),
       signInWithPassword:async()=>({error:null}),signOut:async()=>({error:null})
     },
     functions:{invoke:async()=>({data:responseList[Math.min(index++,responseList.length-1)],error:null})}
   };
   window.supabase={createClient:()=>client};
   window.__g9MockRequestCount=()=>index;
  },{order,authenticated,checkout,responseList});
  await page.goto(origin+'/post-payment-badges-testing.html',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>{
   const msg=document.querySelector('#postpay-awards-message');
   return msg&&!/Checking your completed checkout|Checking for verified checkout/.test(msg.textContent||'');
  },null,{timeout:25000});
  await verify(page);
  results.push({title,pass:true});console.log('PASS '+title);
 }catch(e){
  results.push({title,pass:false,error:String(e)});
  console.log('FAIL '+title+' '+String(e.stack||e));
 }finally{await context.close()}
}
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 await test('verified checkout shows only authoritative State Level 5',{
  verify:async p=>{
   assert.equal(await p.locator('.pj-award-card').count(),1);
   assert.match(await p.locator('.pj-award-title').textContent(),/Rhode Island/);
   assert.match(await p.locator('.pj-award-front').textContent(),/Level 5/);
   assert.equal(await p.locator('#postpay-awards-retry').isVisible(),false);
   await p.locator('.pj-award-card').click();
   assert.equal(await p.locator('.pj-award-card').evaluate(el=>el.classList.contains('is-flipped')),true);
  }
 });
 await test('pending G9 worker keeps other-family card and offers Check Again',{
  replies:[{status:'ready',event,awards:[heat],nearMisses:[],state_processing:'pending'},
    {status:'ready',event,awards:[heat,state],nearMisses:[],state_processing:'complete'}],
  verify:async p=>{
   assert.equal(await p.locator('.pj-award-card').count(),1);
   assert.equal(await p.locator('#postpay-awards-retry').isVisible(),true);
   assert.match(await p.locator('#postpay-awards-message').textContent(),/State Badge processing is still finishing/);
   await p.locator('#postpay-awards-retry').click();
   await p.waitForFunction(()=>document.querySelectorAll('.pj-award-card').length===2);
   assert.equal(await p.locator('#postpay-awards-retry').isVisible(),false);
   assert.match(await p.locator('#earned-badge-grid').textContent(),/Rhode Island/);
  }
 });
 await test('earned-only division completion secret is presented with no invented art',{
  replies:[{status:'ready',event,awards:[state,secret],nearMisses:[],state_processing:'complete'}],
  verify:async p=>{
   assert.equal(await p.locator('.pj-award-card').count(),2);
   assert.match(await p.locator('#earned-badge-grid').textContent(),/New England · Division Complete/);
   assert.equal(await p.locator('.pj-award-card').nth(1).locator('.pj-award-art').isVisible(),false);
  }
 });
 await test('pending checkout reveals no claimed awards',{
  replies:[{status:'pending',event,awards:[],nearMisses:[]}],
  verify:async p=>{
   assert.equal(await p.locator('.pj-award-card').count(),0);
   assert.equal(await p.locator('#postpay-awards-retry').isVisible(),true);
  }
 });
 await test('mismatched event fails closed rather than revealing awards',{
  replies:[{status:'ready',event:{type:'checkout',id:'DIFFERENT_ORDER_123'},awards:[state],nearMisses:[]}],
  verify:async p=>{
   assert.equal(await p.locator('.pj-award-card').count(),0);
   assert.match(await p.locator('#postpay-awards-message').textContent(),/could not verify/i);
  }
 });
 await test('signed-out session cannot show State awards',{
  authenticated:false,
  verify:async p=>{
   assert.equal(await p.locator('.pj-award-card').count(),0);
   assert.match(await p.locator('#postpay-awards-message').textContent(),/Sign in with a verified isolated Testing account/);
   assert.equal(await p.evaluate(()=>window.__g9MockRequestCount()),0);
  }
 });
 await test('missing checkout reference blocks all award queries',{
  checkout:false,
  verify:async p=>{
   assert.equal(await p.locator('.pj-award-card').count(),0);
   assert.match(await p.locator('#postpay-awards-message').textContent(),/No checkout reference is available/);
   assert.equal(await p.evaluate(()=>window.__g9MockRequestCount()),0);
  }
 });
}finally{
 if(browser)await browser.close();
 await new Promise(ok=>server.close(ok));
}
console.log('G9 isolated post-payment browser regression: '+results.filter(x=>x.pass).length+'/'+results.length+' passed');
if(results.some(x=>!x.pass))process.exitCode=1;
