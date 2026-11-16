/* Pepper Junction — Passenger Review data adapter.
 * Product truth: the current CNS JSON, with no hardcoded product copy.
 * Identity: existing Phase 1 PJAuth client.
 * Review eligibility/submission: protected Supabase Review Service, built on Phase 2 purchases.
 * Private rating: separate authenticated customer-owned storage.
 */
(function(){
 'use strict';
 var catalog=null;
 var products=Object.create(null);
 var loading=null;
 var HEAT_LADDER=['Mild','Medium','Hot','Very Hot','Super Hot','Extreme','Inferno'];
 var auth=window.PJAuth||null;
 function uniqueColumn(key){
  if(!catalog)return [];
  var set=new Set();
  catalog.forEach(function(row){
   var val=row[key];
   if(typeof val==='string'&&val.trim())set.add(val.trim());
  });
  return Array.from(set).sort();
 }
 function mapProduct(record){
  return {
   slug:record.slug,name:record['Product Name']||'',
   brand:record.Brand||'',size:record.Size||'',category:record.Category||'',
   foodStyle:record['Food Style']||'',pepperType:record['Pepper Type']||'',
   heatCategory:record['Heat Category']||'',flavorNotes:record['Primary Flavor Notes']||'',
   reviewFlavorOptions:Array.isArray(record['Review Flavor Options'])
    ? record['Review Flavor Options'].filter(function(v){return typeof v==='string'&&!!v.trim();}):[]
  };
 }
 async function loadCatalog(){
  if(catalog)return catalog;
  if(!loading)loading=fetch('data/Database_Pepper_Junction.json',{cache:'no-store'})
   .then(function(res){if(!res.ok)throw new Error('CNS_UNAVAILABLE');return res.json();})
   .then(function(rows){
    if(!Array.isArray(rows)||!rows.length)throw new Error('CNS_INVALID');
    var mapped=Object.create(null);
    rows.forEach(function(p){
     if(!p||typeof p.slug!=='string'||!p.slug)throw new Error('CNS_INVALID');
     if(mapped[p.slug])throw new Error('CNS_DUPLICATE_SLUG');
     mapped[p.slug]=mapProduct(p);
    });
    products=mapped;catalog=rows;return rows;
   }).catch(function(err){loading=null;throw err;});
  return loading;
 }
 async function service(action,slug,extra){
  if(!auth||!auth.enabled||!auth.client)throw new Error('AUTH_UNAVAILABLE');
  var user=await auth.verifiedUser();
  if(!user)throw new Error('SIGN_IN_REQUIRED');
  var payload=Object.assign({action:action,slug:slug},extra||{});
  var response=await auth.client.functions.invoke('pj-review-service',{body:payload});
  if(response.error){
   var detail=response.data;
   if(!detail&&response.error.context&&typeof response.error.context.json==='function'){
    detail=await response.error.context.json().catch(function(){return null;});
   }
   throw new Error(detail&&detail.error||'REVIEW_SERVICE_UNAVAILABLE');
  }
  if(!response.data||response.data.error)throw new Error(response.data&&response.data.error||'REVIEW_SERVICE_UNAVAILABLE');
  return response.data;
 }
 var D={
  loadCatalog:loadCatalog,
  getProduct:function(slug){return products[slug]||null;},
  getFoodStyles:function(){return uniqueColumn('Food Style');},
  getHeatOptions:function(category){
   var i=HEAT_LADDER.indexOf(category);
   if(i<0)return [];
   return HEAT_LADDER.slice(Math.max(0,i-1),Math.min(HEAT_LADDER.length,i+2));
  },
  // Q11 must use the dedicated, owner-approved CNS field. Descriptive notes are not options.
  getFlavorOptions:function(product){return product&&product.reviewFlavorOptions?product.reviewFlavorOptions.slice():[];},
  getHowItHits:function(){return uniqueColumn('How it Hits');},
  // Governed Heat Finish display order, using only values present in the current CNS.
  // New CNS values remain available without requiring individual product edits.
  getHeatFinish:function(){
   var approved=uniqueColumn('Heat Finish');
   var order=['Mutual Split','Thanks for Stopping By','No Hard Feelings','Stays for Coffee','Escorted Out','Say Goodnight'];
   return approved.sort(function(a,b){
    var ai=order.indexOf(a),bi=order.indexOf(b);
    if(ai===-1&&bi===-1)return a.localeCompare(b);
    if(ai===-1)return 1;
    if(bi===-1)return -1;
    return ai-bi;
   });
  },
  getSession:async function(){
   var user=auth&&auth.enabled?await auth.verifiedUser():null;
   return {signedIn:!!user,firstName:user?(user.user_metadata&&user.user_metadata.first_name||'Passenger'):null,passengerClass:null};
  },
  getEligibility:async function(slug){
   if(!auth||!auth.enabled)return {signedIn:false,eligible:false,alreadyReviewed:false,reason:'AUTH_UNAVAILABLE'};
   var user=await auth.verifiedUser();
   if(!user)return {signedIn:false,eligible:false,alreadyReviewed:false,reason:'SIGN_IN_REQUIRED'};
   return service('status',slug);
  },
  submitReview:function(payload){return service('submit',payload.productSlug,{answers:payload.answers,submittedAt:payload.submittedAt});},
  getPersonalRating:async function(slug){var result=await service('rating-read',slug);return result.rating===null?null:Number(result.rating);},
  savePersonalRating:async function(slug,value){var result=await service('rating-save',slug,{value:value});return result.ok===true;},
  // Dev mock switcher retired; never trust URL parameters for customer entitlement.
  mountStateSwitcher:function(){},
  getState:function(){return 'LIVE';}
 };
 window.PJReviewData=D;
})();