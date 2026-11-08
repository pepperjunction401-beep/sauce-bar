// G9 Stage D — isolated Chromium presentation regression.
// This uses the actual Dev passenger-station.html and PJAuth code with a
// MOCKED Supabase session/data source. It is NOT a real authenticated Supabase E2E test.
// All non-local HTTP calls are blocked. No Square, Production, or other accounts touched.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const types = {'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'};
const server = createServer((req,res)=>{
  let path;
  try { path = resolve(root,'.'+decodeURIComponent(new URL(req.url, 'http://localhost').pathname)); }
  catch { res.writeHead(400); res.end(); return; }
  if (!path.startsWith(root+sep) || !existsSync(path) || !statSync(path).isFile()) {
    res.writeHead(404);res.end();return;
  }
  res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});
  createReadStream(path).pipe(res);
});
await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done)});
const port=server.address().port;
let browser;
const tests=[];
const baseCollection={status:'verified',states:[{
  state_code:'RI',level:5,art_path:'assets/badges/states/badges-states-rhode-island.png'
}],earned_divisions:[]};

async function runCase(label,{session=true,projection=baseCollection,projectionError=false,check}){
  const context=await browser.newContext();
  const page=await context.newPage();
  try{
    const blocked=[];
    await page.route('**/*',async route=>{
      const requestUrl=route.request().url();
      if (requestUrl.startsWith('http://127.0.0.1:'+port+'/')) return route.continue();
      if(requestUrl.includes('cdn.jsdelivr.net/npm/@supabase/supabase-js@2/')) {
        return route.fulfill({status:200,contentType:'application/javascript',body:'/* isolated browser mock: supabase client supplied by init script */'});
      }
      blocked.push(requestUrl);
      return route.abort();
    });
    await page.addInitScript(({session,projection,projectionError})=>{
      const customer='11111111-1111-4111-8111-111111111111';
      const verified=session?{id:customer,email:'g9-local-test@example.invalid',email_confirmed_at:'2026-11-06T12:00:00Z'}:null;
      const empty={data:[],error:null};
      const builder=()=>{
        const chain={select(){return chain},eq(){return chain},in(){return chain},
          order(){return chain},limit(){return chain},
          then(onSuccess,onReject){return Promise.resolve(empty).then(onSuccess,onReject)}};
        return chain;
      };
      const client={
        auth:{getUser:async()=>({data:{user:verified},error:null}),
          signOut:async()=>({error:null})},
        from:()=>builder(),
        rpc:async(name)=>{
          if(name==='pj_state_my_collection')
            return projectionError?{data:null,error:{message:'Synthetic projection outage'}}:
              {data:projection,error:null};
          if(name==='pj_loyalty_my_collection')
            return {data:{status:'prelaunch_locked'},error:null};
          return empty;
        }
      };
      window.supabase={createClient:()=>client};
    },{session,projection,projectionError});

    await page.goto('http://127.0.0.1:'+port+'/passenger-station.html',
      {waitUntil:'domcontentloaded',timeout:30000});
    if(!session) {
      await page.waitForURL(/account\.html\?return=station/,{timeout:15000});
      assert.match(page.url(),/account\.html\?return=station/);
    } else {
      await page.waitForFunction(()=>{
        const x=document.getElementById('pj-depot-award-status');
        return x && (/Your Badge Depot|could not be verified|could not be loaded/.test(x.textContent||''));
      },null,{timeout:18000});
      const status=await page.locator('#pj-depot-award-status').textContent();
      assert.match(status,/Your Badge Depot/,'Depot adapter must complete');
      assert.equal(await page.locator('#frame-depot').isVisible(),true,
        'Authenticated Depot iframe must be visible');
      const frame=page.frameLocator('#frame-depot');
      const cards=frame.locator('#states .coin-flip-card');
      assert.equal(await cards.count(),50,'50 State cards');
      assert.equal(await frame.locator('#states .census-region-heading').count(),4,'4 Census regions');
      assert.equal(await frame.locator('#states .census-division-heading').count(),9,'9 Census divisions');
      await check({frame,cards,page});
    }
    console.log('PASS '+label+' | external HTTP blocked: '+blocked.length);
    tests.push({label,pass:true});
  } catch(e){
    console.error('FAIL '+label+': '+(e?.stack||String(e)));
    try{await page.screenshot({path:'/tmp/g9-depot-failure-'+tests.length+'.png',fullPage:false})}catch{}
    tests.push({label,pass:false,error:String(e)});
  } finally{await context.close()}
}

try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const cardByName=(frame,name)=>frame.locator('#states .coin-flip-card').filter({
   has:frame.locator('.coin-badge-name:text-is("'+name+'")')
 });
 await runCase('verified earned Rhode Island Level 5; unearned state locked and cannot flip',{
   check:async({frame})=>{
     const ri=cardByName(frame,'Rhode Island'),ct=cardByName(frame,'Connecticut');
     assert.equal(await ri.count(),1);
     assert.equal(await ct.count(),1);
     assert.equal(await ri.evaluate(el=>el.classList.contains('unearned')),false);
     assert.equal(await ri.locator('.coin-level').isVisible(),false,'tiny State level label replaced');
     assert.equal((await ri.locator('.pj-state-level-bubble').textContent()).trim(),'V','RI Level 5 uses Roman numeral V');
     assert.equal(await ri.locator('.pj-state-level-bubble').getAttribute('aria-label'),'State Badge level 5');
     assert.equal(await ct.locator('.pj-state-level-bubble').count(),0,'locked state has no bubble');
     assert.equal(await ri.locator('.depot-unlock').isVisible(),false);
     assert.equal(await ct.evaluate(el=>el.classList.contains('unearned')),true);
     assert.equal(await ct.locator('.coin-level').isVisible(),false);
     await ri.click();
     assert.equal(await ri.evaluate(el=>el.classList.contains('pj-expanded')),true);
     await ri.click();
     assert.equal(await ri.evaluate(el=>el.classList.contains('pj-flipped')),true);
     await ct.click();
     assert.equal(await ct.evaluate(el=>el.classList.contains('pj-expanded')),false);
     assert.equal(await frame.locator('#pj-earned-state-divisions').count(),0);
   }
 });
 await runCase('earned-only division secret visible',{
   projection:{...baseCollection,earned_divisions:[{
     division_code:'new_england',division_name:'New England',earned_at:'2026-11-06T12:00:00Z'
   }]},
   check:async({frame})=>{
     const section=frame.locator('#pj-earned-state-divisions');
     assert.equal(await section.count(),1);
     assert.equal(await section.locator('.badge-card.secret').count(),1);
     assert.match(await section.textContent(),/New England — Division Complete/);
     assert.doesNotMatch(await section.textContent(),/Middle Atlantic|Pacific|Mountain|West North Central/);
   }
 });
 await runCase('identity not verified: all 50 State cards locked',{
   projection:{status:'identity_not_verified',states:[],earned_divisions:[]},
   check:async({frame,cards})=>{
     assert.equal(await cards.filter({has:frame.locator('.unearned')}).count(),0);
     const locked=await cards.evaluateAll(els=>els.filter(el=>el.classList.contains('unearned')).length);
     assert.equal(locked,50);
     assert.equal(await frame.locator('#pj-earned-state-divisions').count(),0);
     assert.equal(await cardByName(frame,'Rhode Island').locator('.coin-level').isVisible(),false);
     assert.equal(await frame.locator('#states .pj-state-level-bubble').count(),0,'unverified state has zero bubbles');
   }
 });
 await runCase('State RPC unavailable: State cards fail closed; Depot still opens',{
   projectionError:true,
   check:async({frame,cards})=>{
     const locked=await cards.evaluateAll(els=>els.filter(el=>el.classList.contains('unearned')).length);
     assert.equal(locked,50);
     assert.equal(await frame.locator('#pj-earned-state-divisions').count(),0);
   }
 });

 // G9 Test 2: all 50 award assets, real Depot cards, and exactly nine
 // earned-only division secret presentations (synthetic response; no production).
 const allStates=[["AL","Alabama"],["AK","Alaska"],["AZ","Arizona"],["AR","Arkansas"],["CA","California"],["CO","Colorado"],["CT","Connecticut"],["DE","Delaware"],["FL","Florida"],["GA","Georgia"],["HI","Hawaii"],["ID","Idaho"],["IL","Illinois"],["IN","Indiana"],["IA","Iowa"],["KS","Kansas"],["KY","Kentucky"],["LA","Louisiana"],["ME","Maine"],["MD","Maryland"],["MA","Massachusetts"],["MI","Michigan"],["MN","Minnesota"],["MS","Mississippi"],["MO","Missouri"],["MT","Montana"],["NE","Nebraska"],["NV","Nevada"],["NH","New Hampshire"],["NJ","New Jersey"],["NM","New Mexico"],["NY","New York"],["NC","North Carolina"],["ND","North Dakota"],["OH","Ohio"],["OK","Oklahoma"],["OR","Oregon"],["PA","Pennsylvania"],["RI","Rhode Island"],["SC","South Carolina"],["SD","South Dakota"],["TN","Tennessee"],["TX","Texas"],["UT","Utah"],["VT","Vermont"],["VA","Virginia"],["WA","Washington"],["WV","West Virginia"],["WI","Wisconsin"],["WY","Wyoming"]];
 const allDivisions=[["new_england","New England"],["middle_atlantic","Middle Atlantic"],["east_north_central","East North Central"],["west_north_central","West North Central"],["south_atlantic","South Atlantic"],["east_south_central","East South Central"],["west_south_central","West South Central"],["mountain","Mountain"],["pacific","Pacific"]];
 const fullCollection={
   status:'verified',
   states:allStates.map(([code,name])=>({
     state_code:code,level:code==='RI'?12:1,
     art_path:'assets/badges/states/badges-states-'+
       (code==='TN'?'tennesee':name.toLowerCase().replaceAll(' ','-'))+'.png'
   })),
   earned_divisions:allDivisions.map(([code,name])=>({
     division_code:code,division_name:name,earned_at:'2026-11-07T12:00:00Z'
   }))
 };
 await runCase('TEST 2: all 50 earned State cards, RI Level 12 and nine earned division secrets',{
   projection:fullCollection,
   check:async({frame,cards})=>{
     const actualNames=await cards.locator('.coin-badge-name').allTextContents();
     assert.deepEqual(actualNames.map(x=>x.trim()).sort(),
       allStates.map(x=>x[1]).sort(),'complete distinct 50-State card names');
     assert.equal(await cards.evaluateAll(xs=>xs.filter(x=>x.classList.contains('unearned')).length),0);
     for(const [code,name] of allStates){
       const card=cardByName(frame,name);
       assert.equal(await card.count(),1,code+' card count');
       const expectedLevel=code==='RI'?'Lvl 12':'Lvl 1';
       assert.equal(await card.locator('.coin-level').isVisible(),false,code+' obsolete tiny label hidden');
       assert.equal((await card.locator('.pj-state-level-bubble').textContent()).trim(),code==='RI'?'XII':'I',code+' Roman numeral from backend level');
       assert.equal(await card.locator('.pj-state-level-bubble').getAttribute('aria-label'),'State Badge level '+(code==='RI'?12:1),code+' accessible numeric level');
       assert.equal(await card.locator('.depot-unlock').isVisible(),false,code+' unlock hint hidden');
       const src=await card.locator('img.coin-img').first().getAttribute('src');
       const expectedName=code==='TN'?'tennesee':name.toLowerCase().replaceAll(' ','-');
       assert.ok(src.endsWith('/assets/badges/states/badges-states-'+expectedName+'.png'),code+' artwork path');
     }
     const secretSection=frame.locator('#pj-earned-state-divisions');
     assert.equal(await secretSection.count(),1);
     assert.equal(await secretSection.locator('.badge-card.secret').count(),9);
     const secretText=await secretSection.textContent();
     for(const [,name] of allDivisions)
       assert.ok(secretText.includes(name+' — Division Complete'),'earned division '+name);
   }
 });
 await runCase('TEST 2: one earned State but zero secrets never discloses unearned divisions',{
   projection:{...baseCollection,states:[fullCollection.states.find(x=>x.state_code==='RI')],earned_divisions:[]},
   check:async({frame,cards})=>{
     assert.equal(await cards.evaluateAll(xs=>xs.filter(x=>x.classList.contains('unearned')).length),49);
     assert.equal((await cardByName(frame,'Rhode Island').locator('.pj-state-level-bubble').textContent()).trim(),'XII');
     assert.equal(await frame.locator('#states .pj-state-level-bubble').count(),1,'only earned RI has bubble');
     assert.equal(await frame.locator('#pj-earned-state-divisions').count(),0);
   }
 });
 await runCase('no signed-in session: redirected to first-party account sign-in',{session:false});
} finally{
 if(browser)await browser.close();
 await new Promise(done=>server.close(done));
}
console.log('\nG9 Chromium mock-session browser checks: '+tests.filter(t=>t.pass).length+'/'+tests.length+' passed.');
if(tests.some(t=>!t.pass))process.exitCode=1;
