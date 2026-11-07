/**
 * G9 Test 4 — cross-family/read-only Depot and post-payment presentation,
 * responsive viewports, authentication navigation, and cart clear guards.
 * Actual Dev HTML/CSS/JS in isolated Chromium; NO network calls to Square,
 * Pepper Junction Production, or any Supabase instance. Server/auth responses
 * are controlled, in-memory, explicitly synthetic contract fixtures.
 */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createReadStream,existsSync,statSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
const root=process.cwd();
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
const server=createServer((req,res)=>{
 let path;try{path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname))}
 catch{res.writeHead(400);return res.end()}
 if(!path.startsWith(root+sep)||!existsSync(path)||!statSync(path).isFile()){res.writeHead(404);return res.end()}
 res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});
 createReadStream(path).pipe(res);
});
await new Promise((done,err)=>{server.once('error',err);server.listen(0,'127.0.0.1',done)});
const origin='http://127.0.0.1:'+server.address().port;
const order='G9TEST4_CHECKOUT_123';
const event={type:'checkout',id:order};
const member=(family,code,title,extras={})=>({family,code,title,label:family,attribution:event,description:'Verified checkout achievement.',...extras});
const fullAwards=[
 member('heat_identity','heat_identity_mild_l1','Mild'),
 member('food','food_wings','Wings',{level:1}),
 member('purchase_progress','fill_er_up','Fill Er Up',{level:1}),
 member('celestial','2026-10','October 2026'),
 member('round_clock','late_night','Late Night'),
 member('bottle_coin','wheat_penny','Wheat Penny',{level:1}),
 member('state_entry','RI','Rhode Island',{level:2,frontNote:'State Entry · Level 2',image:'assets/badges/states/badges-states-rhode-island.png'}),
 member('state_division_secret','new_england','New England · Division Complete',{fallback:'★'})
];
const nearMisses=[
 {family:'food',badge_code:'food_wings',title:'Epic Wingman',description:'One bottle until the next award.',attribution:event,current_quantity:9,target_quantity:10,remaining_quantity:1,level_step:5,level_completed:4},
 {family:'purchase_progress',badge_code:'fill_er_up',title:'Fill Er Up',description:'A verified close call.',attribution:event,current_cents:4901,target_cents:5000,remaining_cents:99}
];
let pass=0,fail=0;
async function check(name,fn){
 try{await fn();pass++;console.log('PASS '+name)}
 catch(e){fail++;console.error('FAIL '+name+': '+(e.stack||String(e)))}
}
function allowed(route){
 const u=route.request().url();
 if(u.startsWith(origin+'/'))return route.continue();
 if(u.startsWith('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/'))
   return route.fulfill({status:200,contentType:'application/javascript',body:'/* auth supplied by isolated test init script */'});
 return route.abort();
}
async function contextFor(browser,viewport){
 const context=await browser.newContext({viewport});
 const page=await context.newPage();
 await page.route('**/*',allowed);
 return {context,page};
}
function postpayInit(){
 const reply={status:'ready',event,awards:fullAwards,nearMisses,state_processing:'complete'};
 return ({order,reply})=>{
  sessionStorage.setItem('pj_checkout_pending',JSON.stringify({order_id:order,cart_snapshot:'test-only'}));
  const user={id:'test4-user',email:'test4@example.invalid',email_confirmed_at:'2026-11-07T00:00:00Z',is_anonymous:false};
  const client={supabaseUrl:'https://slubpfmpjgoupujptayy.supabase.co',
   auth:{getUser:async()=>({data:{user},error:null}),signInWithPassword:async()=>({error:null}),signOut:async()=>({error:null})},
   functions:{invoke:async()=>({data:reply,error:null})}};
  window.supabase={createClient:()=>client};
 };
}
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 for(const [label,viewport] of [['phone320',{width:320,height:700}],['phone390',{width:390,height:844}],
   ['tablet768',{width:768,height:1024}],['desktop1440',{width:1440,height:900}]]){
   await check('post-payment '+label+' — eight checkout-projected families, artwork, near-miss and layout',async()=>{
    const {context,page}=await contextFor(browser,viewport);
    try{
     await page.addInitScript(postpayInit(),{order,reply:{status:'ready',event,awards:fullAwards,nearMisses,state_processing:'complete'}});
     await page.goto(origin+'/post-payment-badges-testing.html',{waitUntil:'domcontentloaded',timeout:30000});
     await page.waitForFunction(()=>document.querySelectorAll('.pj-award-card').length===8,null,{timeout:22000});
     assert.equal(await page.locator('.pj-award-card').count(),8);
     assert.equal((await page.locator('#badge-count').textContent()).trim(),'8 Earned');
     const ids=await page.locator('.pj-award-card').evaluateAll(els=>els.map(e=>e.dataset.badgeId));
     assert.equal(new Set(ids).size,8,'all families uniquely identified');
     for(const item of fullAwards)assert.ok(ids.some(id=>id.startsWith(item.family+':'+item.code)),item.family+' preserved');
     assert.match(await page.locator('#earned-badge-grid').textContent(),/Rhode Island/);
     assert.match(await page.locator('#earned-badge-grid').textContent(),/New England/);
     const images=await page.locator('.pj-award-card img.pj-award-art').evaluateAll(xs=>xs.map(x=>x.getAttribute('src')).filter(Boolean));
     for(const path of ['badge-mild.png','badge-food-wings.png','badge-purchase-progress-fuel.png',
      'badge-celestial-libra-2026.png','badge-shop-oround-the-clock-late-night.png',
      'badge-coin-penny-obverse.png','badges-states-rhode-island.png'])
      assert.ok(images.some(x=>x.endsWith('/'+path)),path+' mapped');
     assert.equal(await page.locator('#badge-in-your-grasp').isVisible(),true);
     assert.equal(await page.locator('#grasp-grid .pj-grasp-card').count(),2);
     assert.equal(await page.locator('#grasp-grid .pj-grasp-milestone').count(),5);
     assert.equal(await page.locator('#grasp-grid [role="progressbar"]').count(),1);
     const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
     assert.ok(overflow.scroll<=overflow.width+2,
       'horizontal overflow '+overflow.scroll+'px at '+overflow.width+'px');
     const bounds=await page.locator('.pj-award-card').first().boundingBox();
     assert.ok(bounds && bounds.x>=-2 && bounds.x+bounds.width<=viewport.width+2,'award card within viewport');
     await page.locator('.pj-award-card').first().focus();
     await page.keyboard.press('Enter');
     assert.equal(await page.locator('.pj-award-card').first().evaluate(x=>x.classList.contains('is-flipped')),true,
       'keyboard flip works');
     assert.equal(await page.locator('#postpay-awards-retry').isVisible(),false);
    }finally{await context.close()}
   });
 }
 const depotPayload={
  heat:{table:'pj_customer_badge_awards',data:[{badge_code:'heat_identity_mild_l1',award_state:'earned',reversed_at:null}]},
  definitions:{table:'pj_badge_definitions',data:[{badge_code:'heat_identity_mild_l1',badge_family:'heat_identity',badge_level:1,heat_category:'mild'}]},
  food:{table:'pj_food_badge_level_awards',data:[{badge_code:'food_wings',earned_level:1}]},
  foodDefs:{table:'pj_food_badge_definitions',data:[{badge_code:'food_wings',food_category:'wings'}]},
  coins:{table:'pj_bottle_coin_award_events',data:[{coin_code:'wheat_penny',earned_level:1}]},
  progress:{table:'pj_customer_purchase_progress_levels',data:[{badge_code:'fill_er_up',earned_level:1}]}
 };
 for(const [label,viewport] of [['phone390',{width:390,height:844}],['desktop1440',{width:1440,height:900}]]){
  await check('Depot '+label+' — eight existing families retain earned flags when G9 lights RI',async()=>{
   const {context,page}=await contextFor(browser,viewport);
   try{
    await page.addInitScript(({depotPayload})=>{
      const user={id:'11111111-1111-4111-8111-111111111111',email:'test4@example.invalid',email_confirmed_at:'2026-11-07T00:00:00Z'};
      const data=Object.fromEntries(Object.values(depotPayload).map(x=>[x.table,x.data]));
      const empty={data:[],error:null};
      const builder=(table)=>{const chain={select(){return chain},eq(){return chain},order(){return chain},limit(){return chain},in(){return chain},
       then(ok,fail){return Promise.resolve({data:data[table]||[],error:null}).then(ok,fail)}};return chain};
      const rpc={
       pj_celestial_my_earned_months:[{edition_year:2026,month_number:10}],
       pj_round_clock_my_levels:[{window_code:'late_night',earned_level:2}],
       pj_my_earned_time_secrets:[],
       pj_passenger_my_tokens:[{token_code:'day_coach'}],
       pj_milestone_my_awards:[{threshold:10}],
       pj_loyalty_my_collection:{status:'prelaunch_locked'},
       pj_state_my_collection:{status:'verified',states:[{state_code:'RI',level:2,art_path:'assets/badges/states/badges-states-rhode-island.png'}],earned_divisions:[]}
      };
      const client={auth:{getUser:async()=>({data:{user},error:null}),signOut:async()=>({error:null})},
       from:builder,rpc:async(name)=>({data:rpc[name]===undefined?[]:rpc[name],error:null})};
      window.supabase={createClient:()=>client};
    },{depotPayload});
    await page.goto(origin+'/passenger-station.html',{waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForFunction(()=>{
     const e=document.querySelector('#pj-depot-award-status');
     return e && (e.textContent||'').startsWith('Your Badge Depot');
    },null,{timeout:30000});
    const frame=page.frameLocator('#frame-depot');
    const earned=await frame.locator('body').evaluate(body=>{
      const paths=[
       'badge-mild.png','badge-food-wings.png','badge-coin-penny-obverse.png',
       'badge-purchase-progress-fuel.png','badge-shop-oround-the-clock-late-night.png',
       'badge-celestial-libra-2026.png','token-day-coach.png',
       'badge-milestone-sauce-fiend-10.png','badges-states-rhode-island.png'
      ];
      return paths.map(path=>{
        const img=[...body.querySelectorAll('img[src]')].find(x=>(x.getAttribute('src')||'').split('?')[0].endsWith('/'+path));
        const card=img?.closest('.coin-flip-card,.celestial-flip-card,.token-flip-card,.badge-card,.timeslot-card');
        return {path,found:!!img,earned:!!card&&!card.classList.contains('unearned'),
          section:card?.closest('.badge-category')?.id||''};
      });
    });
    for(const item of earned)assert.ok(item.found&&item.earned,JSON.stringify(item));
    const stateCard=frame.locator('#states .coin-flip-card').filter({has:frame.locator('.coin-badge-name:text-is("Rhode Island")')});
    assert.equal((await stateCard.locator('.coin-level').textContent()).trim(),'Lvl 2');
    const ct=frame.locator('#states .coin-flip-card').filter({has:frame.locator('.coin-badge-name:text-is("Connecticut")')});
    assert.equal(await ct.evaluate(e=>e.classList.contains('unearned')),true);
    const round=frame.locator('#shop-oround-the-clock .pj-round-count-bubble');
    assert.ok(await round.count()>=1,'round-clock ×2 bubble remains visible');
    assert.equal(await frame.locator('#pj-earned-state-divisions').count(),0);
    assert.equal(await page.locator('#frame-depot').isVisible(),true);
   }finally{await context.close()}
  });
 }
 await check('account return navigation uses existing signed-in flow; no new matcher or credentials',async()=>{
  const {context,page}=await contextFor(browser,{width:390,height:844});
  try{
   await page.addInitScript(()=>{
    const user={id:'11111111-1111-4111-8111-111111111111',email:'test4@example.invalid',email_confirmed_at:'2026-11-07T00:00:00Z'};
    const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:{display_name:'Verified Testing'},error:null})};
    const client={auth:{getUser:async()=>({data:{user},error:null}),signOut:async()=>({error:null})},
      rpc:async()=>({data:{status:'prelaunch_locked'},error:null}),from:()=>q};
    window.supabase={createClient:()=>client};
   });
   await page.goto(origin+'/account.html?return=post-payment',{waitUntil:'domcontentloaded'});
   await page.getByRole('button',{name:'Continue to Passenger Station'}).click();
   await page.waitForURL(/post-payment-badges\.html/,{timeout:15000});
   assert.ok(new URL(page.url()).pathname.endsWith('/post-payment-badges.html'), 'Post-payment return pathname');
   await page.goto(origin+'/account.html?return=station',{waitUntil:'domcontentloaded'});
   await page.getByRole('button',{name:'Continue to Passenger Station'}).click();
   await page.waitForURL(/passenger-station\.html/,{timeout:15000});
   assert.ok(new URL(page.url()).pathname.endsWith('/passenger-station.html'), 'Station navigation pathname, ignoring its section hash');
  }finally{await context.close()}
 });
 for(const [name,confirmed,edited] of [['unconfirmed payment retains cart',false,false],
   ['confirmed exact cart clears safely',true,false],
   ['confirmed payment preserves edited cart',true,true]]){
   await check('checkout guard — '+name,async()=>{
    const {context,page}=await contextFor(browser,{width:390,height:844});
    try{
     await page.addInitScript(({order,edited})=>{
      const original='[{"sku":"A","qty":1}]';
      sessionStorage.setItem('pj_checkout_pending',JSON.stringify({order_id:order,cart_snapshot:original}));
      sessionStorage.setItem('pj_cart',edited?'[{"sku":"A","qty":2}]':original);
      window.__test4CartEvents=0;
      window.addEventListener('pj-cart-updated',()=>window.__test4CartEvents++);
     },{order,edited});
     let intercepted=0;
     await page.route('https://cdbenwthxhypuuipyjlv.supabase.co/functions/v1/checkout-order-confirmed',route=>{
      intercepted++;
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({confirmed})});
     });
     await page.goto(origin+'/post-payment-badges.html',{waitUntil:'domcontentloaded',timeout:30000});
     await page.waitForFunction(()=>document.readyState==='complete');
     await page.waitForTimeout(260);
     const got=await page.evaluate(()=>({
      cart:sessionStorage.getItem('pj_cart'),
      pending:sessionStorage.getItem('pj_checkout_pending'),
      updated:window.__test4CartEvents
     }));
     assert.equal(intercepted,1,'production confirmation URL was intercepted, never contacted');
     if(!confirmed){assert.ok(got.cart);assert.ok(got.pending);assert.equal(got.updated,0)}
     else if(edited){assert.ok(got.cart);assert.equal(got.pending,null);assert.equal(got.updated,0)}
     else{assert.equal(got.cart,null);assert.equal(got.pending,null);assert.equal(got.updated,1)}
    }finally{await context.close()}
   });
 }
} finally{
 await browser.close();
 await new Promise(ok=>server.close(ok));
}
console.log('G9 Test 4 browser and checkout guard: '+pass+'/'+(pass+fail)+' passed');
if(fail)process.exitCode=1;
