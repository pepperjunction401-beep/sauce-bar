// Server-only read adapter. Never return or log raw customer records.
export const VERSION="2026-09-16";
export const STREAMS=[["accounts","loyalty_accounts",200],["events","events",30],["rewards","rewards",30]];
export async function squareRead(fetcher,base,token,path,body,deadline,timeout=ms=>AbortSignal.timeout(ms)){
 if(!["https://connect.squareup.com","https://connect.squareupsandbox.com"].includes(base)||
 !["/v2/loyalty/programs/main",...STREAMS.map(s=>"/v2/loyalty/"+s[0]+"/search")].includes(path))throw Error("SQUARE_ENDPOINT_NOT_ALLOWED");
 for(let attempt=0;attempt<3;attempt++){
  const remaining=deadline-Date.now();
  if(remaining<1000)throw Error("CAPTURE_RESUME_REQUIRED");
  let r;
  try{r=await fetcher(base+path,{method:body===undefined?"GET":"POST",
   headers:{Authorization:"Bearer "+token,"Square-Version":VERSION,"Content-Type":"application/json"},
   body:body===undefined?undefined:JSON.stringify(body),redirect:"error",signal:timeout(Math.min(8000,remaining-500))});}
  catch(_){if(attempt===2)throw Error("SQUARE_NETWORK_UNAVAILABLE");continue;}
  if(r.status===429||r.status>=500){if(attempt===2)throw Error("SQUARE_TEMPORARILY_UNAVAILABLE");continue;}
  if(!r.ok)throw Error("SQUARE_HTTP_"+r.status);
  const d=await r.json().catch(()=>null);
  if(!d||typeof d!=="object"||Array.isArray(d)||d.errors?.length)throw Error("SQUARE_INVALID_RESPONSE");
  return d;
 }
 throw Error("SQUARE_TEMPORARILY_UNAVAILABLE");
}
export function validatePage(d,key,limit,cursor){
 if(d[key]===undefined&&!d.cursor)d={...d,[key]:[]};
 if(!Array.isArray(d[key])||d[key].length>limit||d[key].some(x=>!x||typeof x.id!=="string"||!x.id.trim())||
 (d.cursor!=null&&typeof d.cursor!=="string")||(d.cursor&&d.cursor===cursor))throw Error("SQUARE_INVALID_PAGE");
 return d;
}
export async function captureStep({db,fetcher,base,token,digest,deadline,maxPages=6,timeout}){
 if(!await db.enabled())throw Error("CAPTURE_DISABLED");
 const read=(path,body)=>squareRead(fetcher,base,token,path,body,deadline,timeout);
 const d=await read("/v2/loyalty/programs/main");
 if(d.program?.status!=="ACTIVE"||typeof d.program?.id!=="string"||!d.program.id.trim())throw Error("SQUARE_LOYALTY_NOT_ACTIVE");
 let run=await db.getRun();
 if(!run)run=await db.createRun(d.program.id,VERSION);
 if(run.source_program_id!==d.program.id||run.api_version!==VERSION)throw Error("CAPTURE_PROGRAM_MISMATCH");
 if(run.state!=="capturing")return {state:run.state,pagesAdded:0};
 let added=0;
 for(const [stream,key,limit] of STREAMS){
  let last=await db.lastPage(run.id,stream);
  if(last&&last.next_cursor===null)continue;
  while(added<maxPages&&deadline-Date.now()>1500){
   if(!await db.enabled())throw Error("CAPTURE_DISABLED");
   const cursor=last?.next_cursor??null;
   const body={limit,...(cursor?{cursor}:{}),...(stream==="accounts"?{query:{}}:{})};
   const page=validatePage(await read("/v2/loyalty/"+stream+"/search",body),key,limit,cursor);
   await db.append(run.id,stream,cursor,page,await digest(JSON.stringify(page)));
   added++;
   last={next_cursor:page.cursor||null};
   if(last.next_cursor===null)break;
  }
  if(added>=maxPages||deadline-Date.now()<=1500)break;
 }
 return {state:(await db.getRun()).state,pagesAdded:added};
}
