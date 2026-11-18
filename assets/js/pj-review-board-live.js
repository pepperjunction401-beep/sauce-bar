/* Pepper Junction — live Passenger Station Review Board presentation adapter.
 * The approved Board artwork and 68-product row ordering remain in passenger-station.html.
 * Purchase eligibility and review status come solely from pj-review-service.
 * Authoritative achievements and protected reward selections come from Supabase Testing.
 * No demo awards, client-side prize decisions, redemption, or Square imports.
 */
(function(){
  'use strict';
  function parseBoardManifest(frame){
    // Read the existing approved Board manifest from its first-party srcdoc.
    // Never build a second product registry or alter its product order.
    var source=frame.srcdoc||'';
    var products=/const PRODUCTS=(\[[^\n]+\]);/.exec(source);
    var files=/const IMAGE_FILES=(\{[^\n]+\});/.exec(source);
    if(!products||!files)throw new Error('BOARD_MANIFEST_UNAVAILABLE');
    var list=JSON.parse(products[1]),images=JSON.parse(files[1]);
    if(!Array.isArray(list)||!list.length)throw new Error('BOARD_MANIFEST_INVALID');
    return {products:list,images:images};
  }
  function mount(){
    var frame=document.getElementById('frame-board');
    if(!frame)throw new Error('BOARD_FRAME_MISSING');
    frame.hidden=true; // Never expose the embedded demonstration while loading.
    var status=document.getElementById('pj-review-board-status');
    if(!status){
      status=document.createElement('div');
      status.id='pj-review-board-status';
      status.setAttribute('role','status');
      status.style.cssText='padding:18px 20px;background:#203522;color:#F5E6C8;text-align:center;font:14px Josefin Sans,sans-serif';
      frame.insertAdjacentElement('beforebegin',status);
    }
    status.textContent='Checking your verified purchases…';
    var requested=new URLSearchParams(location.search).get('product');
    var client=window.PJReviewData;
    if(!client||typeof client.getReviewBoard!=='function'){
      status.textContent='The Review Board is temporarily unavailable.';
      return;
    }
    var fetched=client.getReviewBoard();
    var loaded=new Promise(function(resolve){
      function ready(){
        var doc=frame.contentDocument;
        if(doc&&doc.querySelector('#board .product')){resolve(doc);return true;}
        return false;
      }
      if(!ready())frame.addEventListener('load',function whenLoaded(){
        frame.removeEventListener('load',whenLoaded);
        resolve(ready()?frame.contentDocument:null);
      });
    });
    Promise.all([fetched,loaded]).then(function(pair){
      var result=pair[0],doc=pair[1];
      if(!doc||!result||!Array.isArray(result.products))throw new Error('BOARD_UNAVAILABLE');
      var manifest=parseBoardManifest(frame);
      var cards=doc.querySelectorAll('#board .product');
      if(cards.length!==manifest.products.length)throw new Error('BOARD_ROSTER_MISMATCH');
      var state=new Map();
      result.products.forEach(function(item){
        if(item&&typeof item.product_slug==='string')state.set(item.product_slug,item);
      });
      // Remove every preview control and the unverified award/prize actions.
      var controls=doc.querySelector('.controls');
      if(controls)controls.remove();
      var banner=doc.querySelector('.banner');
      if(banner)banner.textContent='Verified purchases unlock your products. Review submissions are subject to approval.';
      var footnote=doc.querySelector('.footnote');
      if(footnote)footnote.textContent='Verified purchases and submitted questionnaires determine your progress. Row prizes are protected until Square confirms a qualifying redemption order.';
      var unlocked=0,submitted=0,approved=0,focused=null;
      manifest.products.forEach(function(product,index){
        var card=cards[index],item=state.get(product.slug);
        var eligible=!!(item&&item.eligible),reviewed=!!(item&&item.already_reviewed);
        var moderation=reviewed?String(item.moderationStatus||'pending').toLowerCase():'';
        var isApproved=reviewed&&moderation==='approved';
        var revealed=eligible||reviewed;
        if(revealed)unlocked++;
        if(reviewed)submitted++;
        if(isApproved)approved++;
        card.classList.remove('locked','unlocked','reviewed');
        card.classList.add(!revealed?'locked':reviewed?'reviewed':'unlocked');
        var brand=card.querySelector('.brandname'),name=card.querySelector('.name');
        if(brand)brand.textContent=revealed?product.brand:'Product locked';
        if(name)name.textContent=revealed?product.name:'????';
        var thumb=card.querySelector('.thumb');
        if(thumb){
          thumb.replaceChildren();
          if(revealed){
            var image=manifest.images[String(product.id)];
            if(image){
              var img=doc.createElement('img');
              img.className='product-image';img.src='assets/sauces/'+encodeURIComponent(image);
              img.alt=product.brand+' — '+product.name;img.loading='lazy';
              var fallback=doc.createElement('span');
              fallback.className='no-image';fallback.hidden=true;fallback.textContent='Image pending';
              img.addEventListener('error',function(){img.hidden=true;fallback.hidden=false;});
              thumb.append(img,fallback);
            }else{
              var missing=doc.createElement('span');missing.className='no-image';
              missing.textContent='Image pending';thumb.appendChild(missing);
            }
          }else{
            var symbol=doc.createElement('span');symbol.className='bottle';symbol.textContent='◈';
            var lock=doc.createElement('span');lock.className='lock';lock.textContent='🔒';
            thumb.append(symbol,lock);
          }
        }
        var rating=card.querySelector('.ratingrow');
        if(rating)rating.textContent=isApproved?'★ Approved':reviewed?(
          moderation==='rejected'?'Review Not Approved':
          moderation==='frozen'?'Review Under Review':'Review Pending Approval'
        ):eligible?'★ Purchase Verified':'☆ Locked';
        var buttons=card.querySelectorAll('.actions button');
        var primary=buttons[0],secondary=buttons[1];
        if(primary){
          primary.removeAttribute('onclick');
          primary.disabled=!(eligible&&!reviewed);
          primary.textContent=reviewed?'Review Submitted':eligible?'Leave a Review':'Purchase Required';
          if(!primary.disabled)primary.addEventListener('click',function(){
            // The protected questionnaire AND submit RPC independently check eligibility.
            var target=new URL('review.html',location.href);
            target.searchParams.set('product',product.slug);
            location.assign(target.href);
          });
        }
        if(secondary){
          secondary.removeAttribute('onclick');
          secondary.disabled=true; // Review Yard is a separate, not-yet-live workstream.
          secondary.textContent=reviewed?'Review Yard Coming Soon':'Your Review ↻';
        }
        var oldPrize=card.querySelector('.prize-choice');
        if(oldPrize)oldPrize.remove();
        if(requested===product.slug)focused=card;
      });
      // Row achievements come exclusively from the authenticated Review Service.
      // Never infer an entitlement from local card counts or preview UI.
      if(!Array.isArray(result.rows))throw new Error('BOARD_AWARD_STATE_MISSING');
      var authoritativeRows=new Map();
      result.rows.forEach(function(item){
        if(item&&Number.isInteger(item.rowNumber))authoritativeRows.set(item.rowNumber,item);
      });
      doc.querySelectorAll('#board .section').forEach(function(row,index){
        var stateRow=authoritativeRows.get(index+1);
        if(!stateRow)throw new Error('BOARD_ROW_STATE_MISSING');
        var n=stateRow.submitted;
        row.classList.toggle('achieved',stateRow.achieved===true);
        var progress=row.querySelector('.progress');
        if(progress)progress.textContent=n+'/8 submitted'+(
          stateRow.achieved===true?' · Achievement earned':
          stateRow.slotsFilled<8?' · Awaiting complete row':' · Reward pending completion'
        );
        var heading=row.querySelector('.heading h2');
        if(heading)heading.textContent='Collection Row '+(index+1);
        row.querySelectorAll('.prize-choice').forEach(function(el){el.remove();});
        var headingEl=row.querySelector('.heading');
        if(headingEl){
          headingEl.querySelectorAll('.pj-live-reward-state').forEach(function(el){el.remove();});
          if(stateRow.achieved){
            var note=doc.createElement('div');
            note.className='reward-status pj-live-reward-state';
            if(stateRow.entitlementStatus==='redeemed'){
              note.textContent='Complimentary product redeemed · row achievement permanently earned';
            }else if(stateRow.entitlementStatus==='selected'){
              var chosen=manifest.products.find(function(p){return p.slug===stateRow.selectedProductSlug;});
              note.textContent='Complimentary selection saved: '+(chosen?chosen.name:'Your selected product')+
                ' · Redemption available with a future paid order';
            }else if(stateRow.entitlementStatus==='available'){
              note.textContent='Achievement earned · choose one available item from this row';
            }else{
              note.textContent='Achievement earned · awaiting entitlement verification';
            }
            headingEl.appendChild(note);
            // Local Testing: transfer the selected reward into Pepper Junction's
            // own cart. Its existing Checkout Now entry handles the Square handoff.
            var firstParty=['localhost','127.0.0.1',
              'pepperjunction401.com','www.pepperjunction401.com'].indexOf(location.hostname)!==-1;
            if(firstParty&&stateRow.entitlementStatus==='selected'){
              var control=doc.createElement('button');
              control.type='button';
              control.style.cssText='display:block;margin:8px 0 4px;background:#DFB454;color:#203522;border:1px solid #9b6a2c;border-radius:4px;padding:8px 12px;font-weight:bold;cursor:pointer';
              control.textContent='Add Reward to Pepper Junction Cart';
              control.addEventListener('click',function(){
                // Remember the customer's intent across local pages, not an award decision.
                try {sessionStorage.setItem('pj_review_cart_row',String(index+1));}catch(_){}
                var target=new URL('cart-page.html',location.href);
                target.searchParams.set('reviewRewardRow',String(index+1));
                location.assign(target.toString());
              });
              headingEl.appendChild(control);
            }
          }
        }
        var canSelect=stateRow.achieved===true &&
          (stateRow.entitlementStatus==='available'||stateRow.entitlementStatus==='selected');
        var options=new Set(Array.isArray(stateRow.rewardEligibleSlugs)?stateRow.rewardEligibleSlugs:[]);
        if(canSelect){
          manifest.products.slice(index*8,index*8+8).forEach(function(product,offset){
            if(!options.has(product.slug))return;
            var card=cards[index*8+offset];
            if(!card)return;
            var stripe=doc.createElement('div');
            stripe.className='prize-choice pj-live-prize-choice';
            var button=doc.createElement('button');
            button.type='button';
            button.textContent=stateRow.selectedProductSlug===product.slug?'Selected ✓':'Select One';
            if(stateRow.selectedProductSlug===product.slug)button.disabled=true;
            button.addEventListener('click',function(){
              if(button.disabled)return;
              button.disabled=true;
              button.textContent='Saving selection…';
              client.selectReviewReward(index+1,product.slug).then(function(){
                // Re-read saved, server-authoritative state; do not trust local selection.
                location.reload();
              }).catch(function(error){
                button.disabled=false;
                button.textContent='Select One';
                var note=row.querySelector('.pj-live-reward-state');
                if(note)note.textContent='Unable to save reward choice. Please check availability and try again.';
                console.warn('Reward selection unavailable',error);
              });
            });
            stripe.appendChild(button);
            card.insertBefore(stripe,card.querySelector('.copy'));
          });
          if(!options.size&&headingEl){
            var msg=headingEl.querySelector('.pj-live-reward-state');
            if(msg)msg.textContent='Achievement earned · complimentary choice available when eligible products return to stock';
          }
        }
      });
      var a=doc.getElementById('a'),b=doc.getElementById('b'),c=doc.getElementById('c');
      if(a)a.textContent=unlocked+'/'+manifest.products.length;
      if(b)b.textContent=submitted;
      if(c)c.textContent=result.rows.filter(function(r){return r.achieved===true;}).length+'/8';
      var stats=doc.querySelectorAll('.stat span');
      if(stats.length>2)stats[2].textContent='Completed eligible rows';
      // The Board opens only when the real customer-specific response is applied.
      status.hidden=true;frame.hidden=false;
      frame.style.height=Math.max(doc.body.scrollHeight,750)+'px';
      if(focused){
        focused.style.outline='3px solid #F3CA68';
        if(location.hash==='#board')focused.scrollIntoView({block:'nearest'});
      }
    }).catch(function(error){
      console.warn('Verified Review Board unavailable',error);
      frame.hidden=true;
      status.hidden=false;
      status.textContent='Unable to verify your Review Board right now. Nothing has been unlocked without verified purchase evidence.';
    });
  }
  window.PJReviewBoardLive=Object.freeze({mount:mount});
})();
