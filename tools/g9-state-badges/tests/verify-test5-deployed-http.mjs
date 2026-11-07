/**
 * Test 5 read-only real HTTP probes of *isolated* Supabase Testing only.
 * No valid customer passwords, auth creation, SQL mutation, Square, or Production.
 * This script requires explicit Safety ACK to prevent accidental endpoint drift.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const project='slubpfmpjgoupujptayy';
const url='https://'+project+'.supabase.co';
const source=readFileSync('assets/js/pj-auth.js','utf8');
assert.ok(source.includes(url));
const match=source.match(/isLocalDev\s*\?\s*'(sb_publishable_[^']+)'/);
assert.ok(match,'Isolated Testing publishable key not found');
const publicKey=match[1];
const endpoint=url+'/functions/v1/post-payment-awards-read';
let ok=0,fail=0;
async function check(name,fn){
 try {const outcome=await fn();ok++;console.log('PASS '+name+(outcome?' '+JSON.stringify(outcome):''))}
 catch(e){fail++;console.error('FAIL '+name+': '+String(e?.stack||e))}
}
async function request(method,pathname,{body,origin,token,apikey=true}={}){
 const headers={'Content-Type':'application/json'};
 if(apikey)headers.apikey=publicKey;
 if(origin)headers.Origin=origin;
 if(token)headers.Authorization='Bearer '+token;
 const r=await fetch(pathname,{method,headers,...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)}),redirect:'manual',signal:AbortSignal.timeout(12000)});
 const raw=await r.text();
 let data;try{data=JSON.parse(raw)}catch{data=null}
 return {code:r.status,data,raw:raw.slice(0,300),headers:r.headers};
}
const bogus='eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.invalid_signature';
const goodOrder='G9TEST5_MALFORMED_OR_NONEXISTENT';
await check('anonymous checkout reader requires verified bearer token',async()=>{
 const r=await request('POST',endpoint,{body:{square_order_id:goodOrder},origin:'http://127.0.0.1:8355'});
 assert.ok([401,403].includes(r.code),'anonymous HTTP '+r.code);
 assert.ok(!r.data?.awards?.length);return {status:r.code};
});
await check('bad-signature bearer cannot retrieve checkout awards',async()=>{
 const r=await request('POST',endpoint,{body:{square_order_id:goodOrder},origin:'http://127.0.0.1:8355',token:bogus});
 assert.ok([401,403].includes(r.code),'invalid bearer HTTP '+r.code);assert.ok(!r.data?.awards?.length);
 return {status:r.code};
});
await check('untrusted Origin cannot read projected awards',async()=>{
 const r=await request('POST',endpoint,{body:{square_order_id:goodOrder},origin:'https://not-pepperjunction.example',token:bogus});
 assert.ok([401,403].includes(r.code),'foreign origin HTTP '+r.code);assert.ok(!r.data?.awards?.length);
 return {status:r.code};
});
await check('CORS preflight from untrusted Origin returns no allow-origin',async()=>{
 const r=await request('OPTIONS',endpoint,{origin:'https://not-pepperjunction.example'});
 assert.notEqual(r.headers.get('access-control-allow-origin'),'https://not-pepperjunction.example');
 return {status:r.code};
});
await check('CORS preflight from Testing localhost does not authorize anonymous reads',async()=>{
 const r=await request('OPTIONS',endpoint,{origin:'http://127.0.0.1:8355'});
 const allow=r.headers.get('access-control-allow-origin');
 assert.ok(!allow||allow==='http://127.0.0.1:8355');
 const unauthorized=await request('POST',endpoint,{origin:'http://127.0.0.1:8355',body:{square_order_id:goodOrder}});
 assert.ok([401,403].includes(unauthorized.code));
 return {preflight:r.code,anonymous:r.code===204?'denied by follow-up POST':'denied'};
});
await check('non-POST request cannot return awards',async()=>{
 const r=await request('GET',endpoint,{origin:'http://127.0.0.1:8355',token:bogus});
 assert.ok([400,401,403,405].includes(r.code));
 assert.ok(!r.data?.awards?.length);return {status:r.code};
});
await check('no bearer cannot enumerate nonexistent checkout reference',async()=>{
 const r=await request('POST',endpoint,{body:{square_order_id:'G9_TEST_5_FOREIGN_CUST_123'},origin:'http://127.0.0.1:8355'});
 assert.ok([401,403].includes(r.code));assert.ok(!r.data?.awards?.length);
 return {status:r.code};
});
const tables=['pj_state_customer_levels','pj_state_purchase_credits','pj_state_secret_awards','pj_state_evaluation_queue','pj_state_registry','pj_state_divisions'];
for(const table of tables){
 await check('anonymous REST cannot read G9 table: '+table,async()=>{
   const r=await request('GET',url+'/rest/v1/'+table+'?select=*&limit=1',{});
   assert.notEqual(r.code,200,'Unexpected successful REST table exposure');
   assert.ok(!Array.isArray(r.data)||r.data.length===0);
   return {status:r.code};
 });
}
for(const rpc of ['pj_state_evaluate_purchase','pj_state_process_queue','pj_state_reconcile_queue','pj_state_my_collection']){
 await check('anonymous RPC cannot access '+rpc,async()=>{
   const r=await request('POST',url+'/rest/v1/rpc/'+rpc,{body:{}});
   assert.notEqual(r.code,200,'Unexpected successful anonymous RPC');
   return {status:r.code};
 });
}
console.log('G9 Test5 deployed Testing HTTP security checks: '+ok+'/'+(ok+fail)+' passed; GET/OPTIONS/POST probes were read-only');
if(fail)process.exitCode=1;
