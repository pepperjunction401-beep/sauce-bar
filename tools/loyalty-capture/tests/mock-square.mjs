// OFFLINE TEST ONLY: overrides fetch; never contacts Square.
let accountCalls=0;
globalThis.fetch=async(url,options)=>{
 const endpoint=new URL(url).pathname;
 if(!url.startsWith('https://connect.squareup.com/v2/loyalty/'))
   throw Error('Unexpected URL in offline fixture: '+url);
 const inactive=process.env.FIXTURE_INACTIVE==='1';
 let body={};
 if(options?.body)body=JSON.parse(options.body);
 if(endpoint==='/v2/loyalty/programs/main')
   return Response.json({program:{id:'FIXTURE_PROGRAM',status:inactive?'INACTIVE':'ACTIVE'}});
 if(inactive)throw Error('No collection calls allowed for inactive program');
 if(endpoint==='/v2/loyalty/accounts/search'){
   accountCalls++;
   if(!body.cursor)return Response.json({loyalty_accounts:[
     {id:'L1',customer_id:'C1',balance:280,lifetime_points:350},
     {id:'L2',customer_id:'C2',balance:35,lifetime_points:75}
   ],cursor:'NEXT'});
   if(body.cursor==='NEXT')return Response.json({loyalty_accounts:[
     {id:'L3',customer_id:'C3',balance:0,lifetime_points:80}
   ]});
   throw Error('Unexpected accounts cursor '+body.cursor);
 }
 if(endpoint==='/v2/loyalty/events/search')
   return Response.json({events:[{id:'E1',type:'ACCUMULATE_POINTS',loyalty_account_id:'L1'},
      {id:'E2',type:'REDEEM_REWARD',loyalty_account_id:'L1'}]});
 if(endpoint==='/v2/loyalty/rewards/search')
   return Response.json({rewards:[{id:'R1',status:'ISSUED',loyalty_account_id:'L1'}]});
 throw Error('Unexpected Square endpoint '+endpoint);
};
