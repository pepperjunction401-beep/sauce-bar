/* Pepper Junction — live Passenger Station Review Board presentation adapter.
 * The approved Board artwork and 66-product row ordering remain in passenger-station.html.
 * Purchase eligibility and review status come solely from pj-review-service.
 * No demo awards, prize selection, badge decisions, or Square imports.
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
      if(footnote)footnote.textContent='Purchase and review states are verified. No complimentary products, badges, or row rewards are issued by this display.';
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
      // Do not infer or award row prizes from client-side review counts.
      doc.querySelectorAll('#board .section').forEach(function(row,index){
        var items=manifest.products.slice(index*8,index*8+8);
        var n=items.filter(function(p){
          var r=state.get(p.slug);
          return r&&r.already_reviewed;
        }).length;
        row.classList.remove('achieved');
        var progress=row.querySelector('.progress');
        if(progress)progress.textContent=n+'/8 submitted · Row rewards verified separately';
        var heading=row.querySelector('.heading h2');
        if(heading)heading.textContent='Collection Row '+(index+1);
        row.querySelectorAll('.prize-choice').forEach(function(el){el.remove();});
      });
      var a=doc.getElementById('a'),b=doc.getElementById('b'),c=doc.getElementById('c');
      if(a)a.textContent=unlocked+'/'+manifest.products.length;
      if(b)b.textContent=submitted;
      if(c)c.textContent=approved;
      var stats=doc.querySelectorAll('.stat span');
      if(stats.length>2)stats[2].textContent='Approved reviews';
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
