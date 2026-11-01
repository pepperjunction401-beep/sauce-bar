(function() {
  'use strict';

  var GOOGLE_REVIEW_URL = 'https://g.page/r/CTI8YAonEJngEBM/review';

  // Transaction-specific awards must come from verified purchase evidence.
  // Never display prototype awards or fabricate near-miss progress.
  var earnedBadges = [];
  var nearMissBadges = [];
  var verifiedOrderLoaded = false;
  var lastRenderedOrder = null;
  var roundNames={early_bird:['Early Bird','badge-shop-oround-the-clock-early-bird.png'],lunch_hour:['Lunch Hour','badge-shop-oround-the-clock-lunch-rush.png'],evening_commute:['Evening Commute','badge-shop-oround-the-clock-evening-commute.png'],late_night:['Late Night','badge-shop-oround-the-clock-late-night.png'],night_owl:['Night Owl','badge-shop-oround-the-clock-night-owl.png']};
  var milestoneNames={10:'Sauce Fiend',25:'Sauce Fanatic',50:'Sauce Addict',100:'Sauce Cra-Cra',250:'Sauce Freak',500:'Sauce Psycho',1000:'Sauce Dementia'};
  var milestoneSlugs={10:'fiend',25:'fanatic',50:'addict',100:'cra-cra',250:'freak',500:'psycho',1000:'dementia'};
  function loadVerifiedOrderAwards(user) {
    if (!user || !window.PJAuth || !window.PJAuth.client) return;
    // The current checkout takes precedence over a prior confirmed order.
    // Never show a previous trip's badges for a newer pending checkout.
    var order=null;
    var pending=null;
    try { pending=JSON.parse(sessionStorage.getItem('pj_checkout_pending')||'null'); }catch(_){}
    if (pending && typeof pending.order_id==='string') {
      order=pending.order_id;
      if (sessionStorage.getItem('pj_postpay_confirmed_order')!==order) return;
    } else {
      order=sessionStorage.getItem('pj_postpay_confirmed_order');
    }
    if (!order) return;
    if (lastRenderedOrder===order) return;
    window.PJAuth.client.rpc('pj_postpay_my_order_awards',{p_square_order_id:order}).then(function(result){
      if(result.error || !result.data || !result.data.verified)return;
      // An older response must not repaint a newer checkout's results.
      var latestPending=null;
      try { latestPending=JSON.parse(sessionStorage.getItem('pj_checkout_pending')||'null'); }catch(_){}
      var expected=latestPending&&latestPending.order_id || sessionStorage.getItem('pj_postpay_confirmed_order');
      if(expected!==order)return;
      lastRenderedOrder=order;
      verifiedOrderLoaded = true;
      earnedBadges=(result.data.awards||[]).map(function(a){
        var title, image;
        if(a.family==='round' && roundNames[a.code]) {
          title=roundNames[a.code][0]; image='assets/badges/shop-oround-the-clock/'+roundNames[a.code][1];
        } else if(a.family==='milestone' && milestoneNames[a.threshold]) {
          title=milestoneNames[a.threshold]; image='assets/badges/milestone/badge-milestone-sauce-'+milestoneSlugs[a.threshold]+'-'+a.threshold+'.png';
        } else if(a.family==='coin') {
          var coinAssets={wheat_penny:'penny',buffalo_nickel:'nickel',mercury_dime:'dime',standing_liberty_quarter:'quarter',walking_liberty_half_dollar:'half-dollar',peace_dollar:'peace-dollar'};
          if(!coinAssets[a.code])return null;
          title=a.code.replace(/_/g,' ').replace(/\\b\\w/g,function(ch){return ch.toUpperCase();});
          image='assets/badges/bottle-purchase-coins/badge-coin-'+coinAssets[a.code]+'-obverse.png';
        } else if(a.family==='heat' && /^heat_identity_(mild|medium|hot|very_hot|super_hot|extreme)_l[123]$/.test(a.code||'')) {
          var heatMatch=a.code.match(/^heat_identity_(.+)_l([123])$/);
          var heatLane=heatMatch[1].replace(/_/g,'-');
          var heatLevel=Number(heatMatch[2]);
          title=heatLane.replace(/-/g,' ').replace(/\\b\\w/g,function(ch){return ch.toUpperCase();})+' — Level '+heatLevel;
          image='assets/badges/heat/'+(heatLevel===1?'':'L'+heatLevel+'-')+'badge-'+heatLane+'.png';
        } else if(a.family==='food' && /^[a-z0-9-]+$/.test(a.category||'')) {
          title=a.title||a.category; image='assets/badges/food/badge-food-'+a.category+'.png';
        } else if(a.family==='purchase_progress') {
          var progressAssets={fill_er_up:'fuel',speakeasy:'spirits',sauce_director:'movies',broadcast:'radio',market_run:'groceries',free_shipping:'free-shipping',distance_rider:'taxi',rock_like_a_doc:'doctor',there_goes_the_house:'mortgage',hot_sauce_over_a_yacht:'boat'};
          if(!progressAssets[a.code])return null;
          title=a.code.replace(/_/g,' ').replace(/\\b\\w/g,function(ch){return ch.toUpperCase();});
          image='assets/badges/purchase-progress/badge-purchase-progress-'+progressAssets[a.code]+'.png';
        } else if(a.family==='celestial' && Number(a.month)>=1 && Number(a.month)<=12) {
          var months=['capricorn','aquarius','pisces','aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius'];
          if(Number(a.year)!==2026)return null; // No verified art mapping for another edition yet.
          title=months[Number(a.month)-1].replace(/^./,function(ch){return ch.toUpperCase();});
          image='assets/badges/celestial/badge-celestial-'+months[Number(a.month)-1]+'-2026.png';
        } else return null;
        return {id:a.family+'-'+(a.code||a.threshold),title:title,label:'Verified purchase achievement',image:image,ribbon:'Badge Earned',frontNote:'Unlocked with your confirmed order',backCopy:'This badge was unlocked through your verified Pepper Junction purchase.'};
      }).filter(Boolean);
      renderEarnedBadges();
      // Milestone eligibility and progress belong solely to the badge engines.
    }).catch(function(){ /* No unverified achievements are shown. */ });
  }


  var soundMuted = false;
  var soundAttempted = false;
  var celebrationLoopEndSeconds = 137;
  var celebrationLoopTimer = null;

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function createEl(tag, className, text) {
    var el = document.createElement(tag);

    if (className) {
      el.className = className;
    }

    if (text) {
      el.textContent = text;
    }

    return el;
  }

  function renderBadgeCard(badge) {
    var card = createEl('article', 'pj-award-card' + (badge.major ? ' is-major' : ''));
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', badge.title + '. Tap to flip.');
    card.dataset.badgeId = badge.id;

    var inner = createEl('div', 'pj-award-inner');
    var front = createEl('div', 'pj-award-face pj-award-front');
    var back = createEl('div', 'pj-award-face pj-award-back');

    var ribbon = createEl('div', badge.major ? 'pj-major-ribbon' : 'pj-card-ribbon', badge.ribbon || 'Badge Earned');
    front.appendChild(ribbon);

    var artWrap = createEl('div', 'pj-award-art-wrap');

    var img = createEl('img', 'pj-award-art');
    img.src = badge.image;
    img.alt = badge.title;

    var placeholder = createEl('div', 'pj-award-placeholder', badge.fallback || 'PJ');

    img.addEventListener('error', function() {
      img.style.display = 'none';
      placeholder.style.display = 'flex';
    });

    artWrap.appendChild(img);
    artWrap.appendChild(placeholder);
    front.appendChild(artWrap);

    front.appendChild(createEl('h3', 'pj-award-title', badge.title));
    front.appendChild(createEl('div', 'pj-award-subtitle', badge.frontNote || badge.label));
    front.appendChild(createEl('div', 'pj-tap-hint', 'Tap to Flip'));

    back.appendChild(createEl('p', 'pj-back-label', badge.label));
    back.appendChild(createEl('h3', null, badge.backTitle || badge.title));
    back.appendChild(createEl('p', null, badge.backCopy || 'This badge was earned on this trip.'));
    back.appendChild(createEl('div', 'pj-back-meta', badge.meta || 'Earned today'));

    if (badge.sound) {
      var action = createEl('div', 'pj-back-action');
      var ringBtn = createEl('button', 'pj-ring-btn', 'Play the Celebration');
      ringBtn.type = 'button';

      ringBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        playCelebration(true);
      });

      action.appendChild(ringBtn);
      back.appendChild(action);
    }

    inner.appendChild(front);
    inner.appendChild(back);
    card.appendChild(inner);

    card.addEventListener('click', function() {
      card.classList.toggle('is-flipped');
      card.setAttribute(
        'aria-label',
        badge.title + (card.classList.contains('is-flipped') ? '. Showing back side.' : '. Tap to flip.')
      );
    });

    card.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      }
    });

    return card;
  }

  function renderEarnedBadges() {
    var grid = qs('#earned-badge-grid');
    var count = qs('#badge-count');

    if (!grid) {
      return;
    }

    grid.innerHTML = '';

    earnedBadges.forEach(function(badge) {
      grid.appendChild(renderBadgeCard(badge));
    });

    if (count) {
      count.textContent = earnedBadges.length ? earnedBadges.length + ' Earned' : 'No verified reveals';
    }
    if (!earnedBadges.length) {
      var notice = createEl('p', 'pj-award-verification-note',
        verifiedOrderLoaded ? 'No new badges were unlocked by this order. Your existing achievements remain in the Badge Depot.' : 'Order-specific badge results are not yet verified on this page. Visit your Badge Depot for your unlocked achievements and progress.');
      notice.setAttribute('role', 'status');
      grid.appendChild(notice);
    }
  }

  function renderNearMiss() {
    var section = qs('#badge-in-your-grasp');
    var grid = qs('#grasp-grid');

    if (!section || !grid) {
      return;
    }

    // Show only server-verified progress. This is not an unlocked award.
    if (!nearMissBadges.length) {
      section.hidden = true;
      return;
    }

    section.hidden = false;
    grid.innerHTML = '';

    nearMissBadges.forEach(function(item) {
      var card = createEl('div', 'pj-grasp-card');

      card.appendChild(createEl('h3', null, item.title));
      card.appendChild(createEl('p', null, item.copy));

      var link = createEl('a', 'pj-btn pj-btn-primary', item.cta);
      link.href = 'main.html';
      link.style.marginTop = '16px';

      card.appendChild(link);
      grid.appendChild(card);
    });
  }

  function setupCustomerState() {
    var shell = qs('.pj-postpay-shell');
    if (!shell) return;
    // A URL preview flag is not customer authentication.
    shell.dataset.customerState = 'signed-out';
    if (!window.PJAuth || !window.PJAuth.enabled) return;
    window.PJAuth.verifiedUser().then(function(user) {
      shell.dataset.customerState = user ? 'signed-in' : 'signed-out';
      if(user)loadVerifiedOrderAwards(user);
      if(user)window.addEventListener('pj-postpay-order-confirmed',function(){loadVerifiedOrderAwards(user);},{once:true});
    }).catch(function() { shell.dataset.customerState = 'signed-out'; });
  }

  function setupSoundToggle() {
    var btn = qs('.pj-sound-toggle');

    if (!btn) {
      return;
    }

    btn.addEventListener('click', function() {
      soundMuted = !soundMuted;
      btn.setAttribute('aria-pressed', soundMuted ? 'true' : 'false');
      btn.textContent = soundMuted ? 'Sound: Off' : 'Sound: On';

      var audio = qs('#pj-badge-music');
      if (!audio) return;

      if (soundMuted) {
        audio.pause();
      } else {
        playCelebration(true);
      }
    });
  }

  function startCelebrationLoopGuard(audio) {
    if (celebrationLoopTimer) {
      clearInterval(celebrationLoopTimer);
    }

    celebrationLoopTimer = setInterval(function() {
      if (audio.paused || soundMuted) return;

      if (audio.currentTime >= celebrationLoopEndSeconds) {
        audio.currentTime = 0;
      }
    }, 40);
  }

  function playCelebration(userRequested) {
    if (soundMuted) {
      return;
    }

    var audio = qs('#pj-badge-music');

    if (!audio) {
      return;
    }

    try {
      if (audio.currentTime >= celebrationLoopEndSeconds) {
        audio.currentTime = 0;
      }

      var playPromise = audio.play();
      startCelebrationLoopGuard(audio);

      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(function() {
          if (!userRequested) {
            /*
              Browser blocked autoplay.
              The Play the Celebration button remains available on major badge backs.
            */
          }
        });
      }
    } catch (err) {}
  }

  function tryMajorRewardSoundOnce() {
    if (soundAttempted) {
      return;
    }

    soundAttempted = true;

    var hasMajorSound = earnedBadges.some(function(badge) {
      return badge.sound;
    });

    if (!hasMajorSound) {
      return;
    }

    /*
      Browser may block this.
      If blocked, customer can use Play the Celebration on the card back.
    */
    setTimeout(function() {
      playCelebration(false);
    }, 700);
  }

  document.addEventListener('DOMContentLoaded', function() {
    setupCustomerState();
    setupSoundToggle();
    renderEarnedBadges();
    renderNearMiss();
    tryMajorRewardSoundOnce();

    /*
      Preserve Google Review link in one place for later wiring/reference.
    */
    window.PJ_GOOGLE_REVIEW_URL = GOOGLE_REVIEW_URL;
  });
})();
