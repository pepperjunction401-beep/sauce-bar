/**
 * Isolated regression: execute the real G9 post-payment Edge Function TypeScript
 * with a query-only in-memory Supabase adapter. No external network or database writes.
 * Run: node tools/g9-state-badges/post-payment/verify-server-g9.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const src=fs.readFileSync('supabase/functions/post-payment-awards-read/index.ts','utf8')
  .replace(/^import .*;\s*$/gm,'');
const javascript=ts.transpileModule(src,{compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None
},reportDiagnostics:true});
assert.equal((javascript.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
let handler;
let writes=0;
let fixture;
const OWNER='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const ORDER1='G9TEST_ORDER_ABC123',ORDER2='G9TEST_ORDER_DEF456';
const P1='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',P2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PAID=(id,order,customer=OWNER)=>({
 id,customer_id:customer,square_order_id:order,purchase_status:'completed',import_status:'attached'
});
const reset=()=>fixture={
  customer_profiles:[{id:OWNER,account_state:'verified_matched'},{id:OTHER,account_state:'verified_matched'}],
  purchases:[PAID(P1,ORDER1),PAID(P2,ORDER2)],
  pj_state_purchase_credits:[{purchase_id:P1,customer_id:OWNER,state_code:'RI',awarded_level:5}],
  pj_state_registry:[{state_code:'RI',state_name:'Rhode Island',art_path:'assets/badges/states/badges-states-rhode-island.png'}],
  pj_state_secret_awards:[],
  pj_state_divisions:[{division_code:'new_england',division_name:'New England'}],
  pj_state_evaluation_queue:[{purchase_id:P1,status:'done'},{purchase_id:P2,status:'done'}],
  pj_customer_badge_awards:[],
  pj_food_badge_level_awards:[],
  pj_purchase_progress_award_events:[],
  pj_celestial_awards:[],
  pj_round_clock_award_events:[],
  pj_bottle_coin_session_purchases:[],
  pj_heat_purchase_contributions:[],
  pj_food_purchase_contributions:[],
  pj_badge_definitions:[],
  pj_food_badge_definitions:[],
  pj_customer_food_badge_levels:[],
  pj_purchase_progress_definitions:[]
};
const reads=[];
function dbQuery(table){
  if(!Object.hasOwn(fixture,table))throw Error('Unsupported table: '+table);
  const filters=[],state={limit:Infinity,single:false};
  const query={
    select(_fields){return query},
    eq(key,value){filters.push([key,value]);return query},
    limit(n){state.limit=n;return query},
    maybeSingle(){state.single=true;return Promise.resolve(result())},
    then(resolve,reject){return Promise.resolve(result()).then(resolve,reject)},
    insert(){writes++;throw Error('Presentation reader attempted INSERT')},
    update(){writes++;throw Error('Presentation reader attempted UPDATE')},
    delete(){writes++;throw Error('Presentation reader attempted DELETE')}
  };
  function result(){
    reads.push({table,filters:[...filters]});
    const rows=fixture[table].filter(row=>filters.every(([key,value])=>row[key]===value));
    if(state.single){
      if(rows.length>1)return {data:null,error:{message:'duplicate row'}};
      return {data:rows[0]||null,error:null};
    }
    return {data:rows.slice(0,state.limit),error:null};
  }
  return query;
}
const fakeDeno={
 env:{get(key){if(key==='SUPABASE_URL')return 'https://slubpfmpjgoupujptayy.supabase.co';
  if(key==='SUPABASE_SERVICE_ROLE_KEY')return 'TEST_ONLY_FAKE';return null}},
 serve(fn){handler=fn}
};
new Function('Deno','createClient','projectCloseCalls',javascript.outputText)(
 fakeDeno,()=>({
  auth:{getUser:async(token)=>({data:{
   user:token==='owner'?{id:OWNER,is_anonymous:false}:token==='other'?{id:OTHER,is_anonymous:false}:null
  },error:token==='owner'||token==='other'?null:{message:'Unauthorized'}})},
  from:dbQuery
 }),()=>[]
);
assert.equal(typeof handler,'function');
async function call({order=ORDER1,token='owner',origin='http://localhost:8376',method='POST'}={}){
 const response=await handler(new Request('http://localhost/functions/v1/post-payment-awards-read',{
  method,headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer '+token},
  ...(method==='POST'?{body:JSON.stringify({square_order_id:order})}:{})
 }));
 return {http:response.status,body:await response.json(),headers:response.headers};
}
const results=[];
async function test(name,run){reset();reads.length=0;writes=0;await run();assert.equal(writes,0);results.push(name);console.log('PASS '+name)}
await test('exact checkout: RI Level 5, authoritative artwork, no historical award leakage',async()=>{
 let r=await call();assert.equal(r.http,200);assert.equal(r.body.status,'ready');
 assert.equal(r.body.state_processing,'complete');assert.equal(r.body.awards.length,1);
 assert.deepEqual(r.body.awards.map(x=>[x.family,x.code,x.level]),[['state_entry','RI',5]]);
 assert.equal(r.body.awards[0].image,'assets/badges/states/badges-states-rhode-island.png');
 assert.deepEqual(r.body.awards[0].attribution,{type:'checkout',id:ORDER1});
 assert.ok(reads.find(q=>q.table==='pj_state_purchase_credits'&&q.filters.some(([k,v])=>k==='purchase_id'&&v===P1)));
});
await test('repeat checkout has independent award; previous RI Level 5 never reappears',async()=>{
 const r=await call({order:ORDER2});assert.equal(r.body.status,'ready');
 assert.equal(r.body.awards.length,0);assert.equal(r.body.state_processing,'complete');
});
await test('unowned order cannot be enumerated',async()=>{
 const r=await call({token:'other'});assert.equal(r.body.status,'pending');
 assert.deepEqual(r.body.awards,[]);assert.equal(r.body.state_processing,undefined);
});
await test('unauthenticated and unknown identity denied',async()=>{
 assert.equal((await call({token:'invalid'})).http,401);
});
await test('wrong/untrusted origin denied; Testing localhost allowed',async()=>{
 assert.equal((await call({origin:'https://example.org'})).http,403);
 const good=await call({origin:'http://127.0.0.1:42789'});
 assert.equal(good.http,200);assert.equal(good.headers.get('access-control-allow-origin'),'http://127.0.0.1:42789');
});
await test('unpaid/unattached checkout never releases awards',async()=>{
 fixture.purchases[0].purchase_status='pending';
 const r=await call();assert.equal(r.body.status,'pending');assert.equal(r.body.awards.length,0);
});
await test('state worker pending: preserve preexisting award and report pending',async()=>{
 fixture.pj_state_purchase_credits=[];
 fixture.pj_state_evaluation_queue[0].status='pending';
 fixture.pj_customer_badge_awards.push({source_purchase_id:P1,customer_id:OWNER,badge_code:'heat_identity_mild_l1',award_state:'earned',reversed_at:null});
 const r=await call();assert.equal(r.body.status,'ready');assert.equal(r.body.state_processing,'pending');
 assert.equal(r.body.awards.length,1);assert.equal(r.body.awards[0].family,'heat_identity');
});
await test('state worker failed: expose pending, never pretend awarded',async()=>{
 fixture.pj_state_purchase_credits=[];fixture.pj_state_evaluation_queue[0].status='failed';
 const r=await call();assert.equal(r.body.state_processing,'pending');assert.equal(r.body.awards.length,0);
});
await test('queue done with no credit: excluded purchase, not phantom award',async()=>{
 fixture.pj_state_purchase_credits=[];
 const r=await call();assert.equal(r.body.state_processing,'complete');assert.equal(r.body.awards.length,0);
});
await test('earned division secret from the identical purchase only',async()=>{
 fixture.pj_state_secret_awards.push({source_purchase_id:P1,customer_id:OWNER,division_code:'new_england'});
 const r=await call();assert.equal(r.body.awards.length,2);
 const secret=r.body.awards.find(x=>x.family==='state_division_secret');
 assert.equal(secret?.title,'New England · Division Complete');
 assert.equal(secret.image,undefined);
 assert.deepEqual(secret.attribution,{type:'checkout',id:ORDER1});
 const other=await call({order:ORDER2});assert.equal(other.body.awards.length,0);
});
await test('secret from another checkout must not leak',async()=>{
 fixture.pj_state_secret_awards.push({source_purchase_id:P2,customer_id:OWNER,division_code:'new_england'});
 const r=await call();assert.equal(r.body.awards.length,1);
 assert.equal(r.body.awards[0].family,'state_entry');
});
await test('no queue credit evidence remains pending; no invented State award',async()=>{
 fixture.pj_state_purchase_credits=[];
 fixture.pj_state_evaluation_queue=[];
 const r=await call();assert.equal(r.body.state_processing,'pending');assert.equal(r.body.awards.length,0);
});
console.log('\nG9 server checkout projection: '+results.length+'/'+results.length+' passed; no external requests or writes.');
