#!/usr/bin/env node
// PEPPER JUNCTION: CAPTURE ONLY. No PJ Credits, Phase 1/2, payment or loyalty mutations.
// Node >= 20, no packages. Square token is NEVER persisted or logged.
// Run only on a trusted computer with owner-authorized Square LOYALTY_READ access.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const API='https://connect.squareup.com';
const VERSION='2026-09-16';
const TYPES={
 accounts:{endpoint:'/v2/loyalty/accounts/search',key:'loyalty_accounts',limit:200},
 events:{endpoint:'/v2/loyalty/events/search',key:'events',limit:30},
 rewards:{endpoint:'/v2/loyalty/rewards/search',key:'rewards',limit:30},
};
const fatal=(message)=>{throw Error(message)};
const outArg=process.argv.find(x=>x.startsWith('--out='))?.slice(6);
const output=path.resolve(outArg||'./square-loyalty-private-capture');
const token=process.env.SQUARE_LOYALTY_READ_TOKEN;
const statOnly=process.argv.includes('--status');
const drill=process.argv.includes('--dry-run');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const integer=x=>Number.isSafeInteger(x)&&x>=0;

async function request(endpoint,method='POST',body){
  for(let attempt=0;attempt<4;attempt++){
    let response;
    try {
      response=await fetch(API+endpoint,{
        method,
        headers:{Authorization:'Bearer '+token,'Square-Version':VERSION,
          'Content-Type':'application/json'},
        body:method==='POST'?JSON.stringify(body):undefined,
        signal:AbortSignal.timeout(25000),
      });
    }catch(e){if(attempt===3)fatal('Square network request failed');await pause(600*(attempt+1));continue}
    if(response.status===429||response.status>=500){
      if(attempt===3)fatal('Square endpoint unavailable (HTTP '+response.status+')');
      await pause(1000*(attempt+1));continue;
    }
    // Never log raw Square error bodies (may contain customer information).
    if(!response.ok)fatal('Square refused '+endpoint+' (HTTP '+response.status+
      '). Check subscription ACTIVE, token permissions, or Square account.');
    const data=await response.json();
    if(!data||Array.isArray(data)||data.errors?.length)
      fatal('Square returned an invalid response for '+endpoint);
    return data;
  }
}
async function jsonRead(file){return JSON.parse(await fs.readFile(file,'utf8'))}
async function atomicWrite(file,text){
  const tmp=file+'.tmp';
  await fs.writeFile(tmp,text,{mode:0o600,flag:'wx'});
  await fs.rename(tmp,file);
}
async function initialize(){
  await fs.mkdir(output,{recursive:true,mode:0o700});
  const stat=await fs.stat(output);
  if((stat.mode&0o077)!==0)fatal('Output directory must be owner-only (chmod 700).');
  const manifest=path.join(output,'manifest.json');
  try {return await jsonRead(manifest)}
  catch(e){
    if(e.code!=='ENOENT')throw e;
    const state={schema:1,apiVersion:VERSION,programId:null,startedAt:new Date().toISOString(),
      streams:Object.fromEntries(Object.keys(TYPES).map(k=>[k,{pages:0,count:0,cursor:null,complete:false}])),
      status:'capturing'};
    await atomicWrite(manifest,JSON.stringify(state,null,2));
    return state;
  }
}
async function save(state){await atomicWriteReplace(path.join(output,'manifest.json'),JSON.stringify(state,null,2))}
async function atomicWriteReplace(file,data){
  const tmp=file+'.new';await fs.writeFile(tmp,data,{mode:0o600,flag:'wx'});
  await fs.rename(tmp,file);
}
async function capture(state,key){
  const t=TYPES[key],s=state.streams[key];
  if(s.complete)return;
  const dir=path.join(output,key);await fs.mkdir(dir,{mode:0o700,recursive:true});
  while(!s.complete){
    const name=String(s.pages+1).padStart(6,'0')+'.json';
    const file=path.join(dir,name);
    let response;
    try{response=await jsonRead(file)}
    catch(e){
      if(e.code!=='ENOENT')throw e;
      const body={limit:t.limit};
      if(s.cursor)body.cursor=s.cursor;
      if(key==='accounts')body.query={};
      response=await request(t.endpoint,'POST',body);
      if(!Array.isArray(response[t.key]))fatal('Square result lacks '+t.key);
      if(response[t.key].length>t.limit)fatal('Square page exceeds documented limit');
      const ids=response[t.key].map(v=>v.id);
      if(ids.some(v=>typeof v!=='string'||!v))fatal('Square response contains missing record IDs');
      if(response.cursor && response.cursor===s.cursor)fatal('Non-advancing Square cursor');
      await atomicWrite(file,JSON.stringify({
        stream:key,page:s.pages+1,requestedCursor:s.cursor,receivedAt:new Date().toISOString(),
        squareResponse:response,
      }));
      response={squareResponse:response,requestedCursor:s.cursor,stream:key,page:s.pages+1};
    }
    if(response.stream!==key||response.page!==s.pages+1||response.requestedCursor!==s.cursor)
      fatal('Cannot resume: existing page cursor/checkpoint disagrees with manifest');
    const raw=response.squareResponse;
    if(!Array.isArray(raw?.[t.key])||raw[t.key].length>t.limit)
      fatal('Stored Square page invalid');
    s.count+=raw[t.key].length;s.pages++;s.cursor=raw.cursor||null;s.complete=!s.cursor;
    await save(state);
    console.log(key+': '+s.count+' captured; '+(s.complete?'complete':'more pages'));
  }
}
async function review(state){
  const rows={};
  for(const [key,s] of Object.entries(state.streams)){
    const ids=new Set();let duplicates=0,items=[],missing=0;
    for(let i=1;i<=s.pages;i++){
      const f=path.join(output,key,String(i).padStart(6,'0')+'.json');
      const page=await jsonRead(f);
      const chunk=page.squareResponse[TYPES[key].key];
      for(const obj of chunk){
        if(ids.has(obj.id))duplicates++;ids.add(obj.id);items.push(obj);
      }
    }
    rows[key]={pages:s.pages,records:s.count,uniqueIds:ids.size,duplicates,complete:s.complete};
    if(key==='accounts'){
      let total=0,aboveCap=0,missingBalance=0,negative=0,unclearIdentity=0;
      let lifetime=0,missingLifetime=0,overCapCount=0;
      for(const a of items){
        if(!a.customer_id)unclearIdentity++;
        if(!integer(a.balance)){missingBalance++;if(Number(a.balance)<0)negative++}
        else{total+=a.balance;aboveCap+=Math.max(0,a.balance-275);
          if(a.balance>275)overCapCount++}
        if(integer(a.lifetime_points))lifetime+=a.lifetime_points;
        else missingLifetime++;
      }
      rows[key].totals={squareOutstanding:total,squareLifetimeEarned:lifetime,
        accountsAbove275:overCapCount,pointsAboveCap:aboveCap,
        missingOrInvalidBalances:missingBalance,negativeBalances:negative,
        missingLifetimePoints:missingLifetime,missingCustomerIds:unclearIdentity};
    }
    if(key==='rewards'){
      rows[key].issuedRewards=items.filter(r=>r.status==='ISSUED').length;
    }
  }
  const complete=Object.values(rows).every(v=>v.complete&&v.duplicates===0);
  const note={schema:1,programId:state.programId,readOnly:true,
    complete,streams:rows,
    safeguard:'NO_WALLET_IMPORT: these are Square balances, not new purchase earnings. Reconcile IDs and purchase overlaps before owner-approved migration.',
    generatedAt:new Date().toISOString()};
  await atomicWriteReplace(path.join(output,'review.json'),JSON.stringify(note,null,2));
  console.log('Review saved. CAPTURE ONLY. No credits awarded.');
}
async function main(){
  if(!token||token.length<10)fatal('Set SQUARE_LOYALTY_READ_TOKEN securely (never commit it).');
  if(drill){console.log('DRY RUN: no Square calls or file writes.');return}
  // Preflight BEFORE any persistence. An inactive program must not create a false archive.
  const result=await request('/v2/loyalty/programs/main','GET');
  const program=result.program;
  if(!program?.id||program.status!=='ACTIVE')
    fatal('Loyalty subscription is not ACTIVE. Capture not started.');
  if(statOnly){console.log('Square Loyalty active; program ID confirmed; no capture performed.');return}
  const state=await initialize();
  if(state.schema!==1||state.apiVersion!==VERSION||!state.streams)
    fatal('Unrecognized archive manifest.');
  if(state.programId&&state.programId!==program.id)
    fatal('Stored archive belongs to a different Square Loyalty program');
  state.programId=program.id;await save(state);
  for(const stream of Object.keys(TYPES))await capture(state,stream);
  state.status='captured';state.finishedAt=new Date().toISOString();await save(state);
  await review(state);
  console.log('Archive captured. Keep the owner-only folder secure and backed up. No customer wallet was touched.');
}
main().catch(e=>{console.error('CAPTURE STOPPED:',e.message);process.exitCode=1});
