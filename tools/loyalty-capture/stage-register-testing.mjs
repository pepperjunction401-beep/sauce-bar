#!/usr/bin/env node
// Pepper Junction — Testing-only Legacy Loyalty register stager.
// Never targets Production, Square, Main, purchase evaluation or wallets.
// Run only with owner-approved capture on an operator-controlled computer.
// Node 20+, no external npm packages. Uses SUPABASE_TESTING_SERVICE_ROLE_KEY
// from a protected environment, NEVER in source files, logs, or GitHub.
import fs from 'node:fs/promises';
import path from 'node:path';

const PROJECT='slubpfmpjgoupujptayy';
const BASE='https://'+PROJECT+'.supabase.co';
const args=Object.fromEntries(process.argv.slice(2).filter(s=>s.startsWith('--')).map(s=>{
 const i=s.indexOf('=');return i<0?[s.slice(2),'true']:[s.slice(2,i),s.slice(i+1)];
}));
const die=msg=>{throw Error(msg)};
if(process.env.PJ_LEGACY_STAGE_APPROVAL!=='STAGE_TESTING_ONLY')
 die('Explicit Testing-only stage approval missing.');
const token=process.env.SUPABASE_TESTING_SERVICE_ROLE_KEY;
if(!token||token.length<20)die('Missing private Testing service-role key.');
const input=args.from?path.resolve(args.from):die('Use --from=/PRIVATE/REGISTER/register.json');
const url=process.env.SUPABASE_TESTING_URL??BASE;
if(url!==BASE)die('Refusing to stage outside isolated Supabase Testing.');

async function rpc(name,args){
 const response=await fetch(url+'/rest/v1/rpc/'+name,{
  method:'POST',headers:{
   'Content-Type':'application/json',
   'apikey':token,
   'Authorization':'Bearer '+token,
  },
  body:JSON.stringify(args),
  signal:AbortSignal.timeout(25000),
 });
 if(!response.ok)die('Testing RPC '+name+' refused (HTTP '+response.status+')');
 return await response.json();
}
async function main(){
 const doc=JSON.parse(await fs.readFile(input,'utf8'));
 if(!doc?.summary?.accountsComplete||!doc.summary.canSeal
   ||!Array.isArray(doc.members)||doc.members.length!==doc.summary.expectedAccounts)
  die('Incomplete or unresolved private register. Do not stage.');
 if(doc.summary.squareProgramId==='OFFLINE_PROGRAM')
  die('Offline test fixtures cannot enter the Testing cohort.');
 const sid=await rpc('pj_legacy_loyalty_stage_begin',{p_summary:doc.summary});
 if(typeof sid!=='string'||!sid)die('Testing did not return snapshot ID.');
 console.log('Testing register staging started. Snapshot ID: '+sid);
 for(let i=0;i<doc.members.length;i+=50){
  const data=doc.members.slice(i,i+50);
  const result=await rpc('pj_legacy_loyalty_stage_batch',{
   p_snapshot_id:sid,p_members:data
  });
  if(result.status!=='staged')die('Unexpected stage response');
  console.log('Staged '+Math.min(i+data.length,doc.members.length)
   +' of '+doc.members.length);
 }
 const status=await rpc('pj_legacy_loyalty_stage_status',{p_snapshot_id:sid});
 if(status.expected!==doc.members.length||status.stored!==doc.members.length)
  die('Testing staging incomplete. Do NOT seal or enable transfers.');
 console.log('Testing-only staging verified. Cohort is unsealed; wallet transfers still disabled.');
 console.log('IMPORTANT: Snapshot sealing and claim activation require separate owner authorization.');
}
main().catch(e=>{console.error('STAGING STOPPED:',e.message);process.exitCode=1});
