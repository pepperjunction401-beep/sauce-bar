#!/usr/bin/env node
// Pepper Junction: convert a complete PRIVATE Square archive into a PRIVATE
// readiness manifest. No network, database, account matching, or credit writes.
// Node >=20; source and output must remain owner-only and must NEVER be committed.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const args=Object.fromEntries(process.argv.slice(2).filter(s=>s.startsWith('--')).map(s=>{
 const pos=s.indexOf('=');return pos<0?[s.slice(2),'true']:[s.slice(2,pos),s.slice(pos+1)];
}));
const die=message=>{throw new Error(message)};
const sourceDir=args.from?path.resolve(args.from):die('Use --from=/PRIVATE/CAPTURE/DIRECTORY');
const outputDir=args.out?path.resolve(args.out):die('Use --out=/PRIVATE/REGISTER/DIRECTORY');
if(sourceDir===outputDir)die('Input and output directories must differ.');
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const sha=thing=>crypto.createHash('sha256').update(thing).digest('hex');
const integer=n=>typeof n==='number'&&Number.isSafeInteger(n);
const write=async(p,value)=>fs.writeFile(p,JSON.stringify(value,null,2),{flag:'wx',mode:0o600});

async function main(){
 const manifest=await read(path.join(sourceDir,'manifest.json'));
 if(manifest.schema!==1||manifest.status!=='captured'||!manifest.programId)
   die('Square capture manifest is missing or not complete');
 const all={};
 const hashes=[];
 for(const [stream,key] of Object.entries({accounts:'loyalty_accounts',events:'events',rewards:'rewards'})){
  const state=manifest.streams?.[stream];
  if(!state?.complete||!Number.isSafeInteger(state.pages)||state.pages<1)
   die(stream+': incomplete capture');
  const entries=[];
  let expectedCursor=null;
  const ids=new Set();
  for(let index=1;index<=state.pages;index++){
   const file=path.join(sourceDir,stream,String(index).padStart(6,'0')+'.json');
   const original=await fs.readFile(file,'utf8');
   const payload=JSON.parse(original);
   if(payload.page!==index||payload.stream!==stream||
       payload.requestedCursor!==expectedCursor)
      die(stream+': capture page checkpoint mismatch at '+index);
   const response=payload.squareResponse;
   if(!response||!Array.isArray(response[key]))die(stream+': missing records array');
   for(const item of response[key]){
    if(!item||typeof item.id!=='string'||!item.id||ids.has(item.id))
      die(stream+': missing or duplicate Square ID');
    ids.add(item.id);entries.push(item);
   }
   expectedCursor=response.cursor||null;
   if(index<state.pages&&!expectedCursor)die(stream+': unexpected final cursor');
   hashes.push(stream+'/'+index+':'+sha(original));
  }
  if(expectedCursor!==null||entries.length!==state.count)
   die(stream+': incomplete pagination or total mismatch');
  all[stream]=entries;
 }
 const customers=new Set(),unresolved=[];
 const members=all.accounts.map(item=>{
  if(!item.program_id||item.program_id!==manifest.programId)
   die('Loyalty account belongs to a different Square program');
  if(item.customer_id&&customers.has(item.customer_id))
   unresolved.push({accountId:item.id,reason:'duplicate_customer_id'});
  if(item.customer_id)customers.add(item.customer_id);
  if(!item.customer_id)unresolved.push({accountId:item.id,reason:'missing_customer_id'});
  if(!integer(item.balance)||item.balance<0)
   unresolved.push({accountId:item.id,reason:'invalid_or_negative_balance'});
  if(!integer(item.lifetime_points)||item.lifetime_points<0)
   unresolved.push({accountId:item.id,reason:'invalid_lifetime_points'});
  return {
   squareLoyaltyAccountId:item.id,
   squareCustomerId:item.customer_id??null,
   outstandingPoints:item.balance??null,
   lifetimePoints:item.lifetime_points??null,
   sourceUpdatedAt:item.updated_at??null,
   rawAccountSha256:sha(JSON.stringify(item))
  };
 });
 const fingerprint=sha(hashes.sort().join('\n'));
 const summary={
  version:1,
  squareProgramId:manifest.programId,
  squareApiVersion:manifest.apiVersion,
  captureStartedAt:manifest.startedAt,
  captureFinishedAt:manifest.finishedAt??null,
  archiveFingerprintSha256:fingerprint,
  expectedAccounts:members.length,
  observedEvents:all.events.length,
  observedRewards:all.rewards.length,
  accountsComplete:true,eventsComplete:true,rewardsComplete:true,
  unresolvedCount:unresolved.length,
  canSeal:unresolved.length===0&&members.length>0,
  conversionCap:275,
  creditsTransferred:0,
  safeguard:'UNCLAIMED SNAPSHOT: no PJ Credits wallet, ledger, or purchase events modified'
 };
 await fs.mkdir(outputDir,{recursive:true,mode:0o700});
 if(((await fs.stat(outputDir)).mode&0o077)!==0)
  die('Output directory must be owner-only (chmod 700)');
 await write(path.join(outputDir,'register.json'),{summary,members,unresolved});
 console.log('Prepared '+members.length+' member rows; unresolved='+unresolved.length+
  '; canSeal='+summary.canSeal+'; wallet credits changed=0');
}
main().catch(err=>{console.error('REGISTER PREPARATION STOPPED:',err.message);process.exitCode=1});
