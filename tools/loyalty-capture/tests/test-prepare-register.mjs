import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const prepare=path.join(root,'..','prepare-register.mjs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pj-legacy-register-test-'));
const folder=path.join(temp,'capture'),output=path.join(temp,'register');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
fs.chmodSync(temp,0o700);
function setup(){
 fs.mkdirSync(folder,{recursive:true,mode:0o700});
 const manifest={schema:1,status:'captured',programId:'OFFLINE_PROGRAM',
  apiVersion:'2026-09-16',startedAt:'2026-11-01T10:00:00Z',finishedAt:'2026-11-01T10:00:01Z',
  streams:{}};
 const data={
  accounts:{key:'loyalty_accounts',array:[
   {id:'L1',program_id:'OFFLINE_PROGRAM',customer_id:'C1',balance:280,lifetime_points:340},
   {id:'L2',program_id:'OFFLINE_PROGRAM',customer_id:'C2',balance:0,lifetime_points:40}]},
  events:{key:'events',array:[{id:'E1',loyalty_account_id:'L1'}]},
  rewards:{key:'rewards',array:[{id:'R1',status:'ISSUED'}]}
 };
 for(const [stream,value] of Object.entries(data)){
  fs.mkdirSync(path.join(folder,stream),{mode:0o700});
  manifest.streams[stream]={pages:1,count:value.array.length,cursor:null,complete:true};
  const payload={stream,page:1,requestedCursor:null,
   receivedAt:'2026-11-01T10:00:01Z',
   squareResponse:{[value.key]:value.array}};
  fs.writeFileSync(path.join(folder,stream,'000001.json'),JSON.stringify(payload));
 }
 fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify(manifest));
 return data;
}
function run(where=output,accountsOnly=false){
 return spawnSync(process.execPath,[prepare,'--from='+folder,'--out='+where,...(accountsOnly?['--accounts-only']:[])],
  {encoding:'utf8',timeout:12000});
}
try {
 const data=setup();
 let r=run();
 assert.equal(r.status,0,r.stderr);
 let register=JSON.parse(fs.readFileSync(path.join(output,'register.json'),'utf8'));
 assert.equal(register.members.length,2);
 assert.equal(register.members[0].outstandingPoints,280);
 assert.equal(register.members[1].outstandingPoints,0);
 assert.equal(register.summary.conversionCap,275);
 assert.equal(register.summary.creditsTransferred,0);
 assert.equal(register.summary.canSeal,true);
 assert.equal(register.summary.observedEvents,1);
 assert.equal(register.summary.observedRewards,1);

 // Break the captured account ID uniqueness. Import must stop before saving.
 const f=path.join(folder,'accounts','000001.json');
 const page=JSON.parse(fs.readFileSync(f,'utf8'));
 page.squareResponse.loyalty_accounts[1].id='L1';
 fs.writeFileSync(f,JSON.stringify(page));
 const failed=run(path.join(temp,'bad'));
 assert.notEqual(failed.status,0);
 assert.equal(fs.existsSync(path.join(temp,'bad','register.json')),false);

 // Reset ID; unresolved negative balance must be clearly surfaced, not spent.
 page.squareResponse.loyalty_accounts[1].id='L2';
 page.squareResponse.loyalty_accounts[1].balance=-3;
 fs.writeFileSync(f,JSON.stringify(page));
 const flagged=run(path.join(temp,'flagged'));
 assert.equal(flagged.status,0,flagged.stderr);
 const review=JSON.parse(fs.readFileSync(path.join(temp,'flagged','register.json'),'utf8'));
 assert.equal(review.summary.canSeal,false);
 assert.equal(review.summary.unresolvedCount,1);
 assert.equal(review.summary.creditsTransferred,0);
 // Account balance snapshot may finish before the optional event/reward streams.
 page.squareResponse.loyalty_accounts[1].balance=0;
 fs.writeFileSync(f,JSON.stringify(page));
 const manifestFile=path.join(folder,'manifest.json');
 const partial=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
 partial.status='capturing';
 partial.finishedAt=undefined;
 partial.streams.events.complete=false;
 partial.streams.rewards.complete=false;
 fs.writeFileSync(manifestFile,JSON.stringify(partial));
 const accountsOnlyPath=path.join(temp,'account-priority');
 const prioritized=run(accountsOnlyPath,true);
 assert.equal(prioritized.status,0,prioritized.stderr);
 const staged=JSON.parse(fs.readFileSync(path.join(accountsOnlyPath,'register.json'),'utf8'));
 assert.equal(staged.summary.canSeal,true);
 assert.equal(staged.summary.accountsComplete,true);
 assert.equal(staged.summary.eventsComplete,false);
 assert.equal(staged.summary.rewardsComplete,false);
 assert.equal(staged.members[0].outstandingPoints,280);
 console.log('PASS register: frozen balances, 275 cap, unique IDs, negatives held, accounts-first staging, no wallet writes');
}finally{
 fs.rmSync(temp,{recursive:true,force:true});
}
