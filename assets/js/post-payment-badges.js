(function() {
  'use strict';

  var GOOGLE_REVIEW_URL = 'https://g.page/r/CTI8YAonEJngEBM/review';

  /*
    FIRST-RUN MOCK DATA.
    Later this array should be replaced by Square/Supabase return-session data.
  */
  var earnedBadges = [
    {
      id: 'free-shipping',
      type: 'major-reward',
      title: 'Free Shipping',
      label: 'Purchase Progress',
      image: 'assets/badges/purchase-progress/free-shipping.png',
      fallback: 'FS',
      ribbon: 'Major Reward Earned',
      frontNote: 'Free shipping pulled into the station.',
      backTitle: 'Free Shipping Earned',
      backCopy: 'Congrats! Free shipping is ready for a future ride. This reward will rest in your Depot until you’re ready to use it.',
      meta: 'Saved reward · Future visit eligible',
      major: true,
      sound: true
    },
    {
      id: 'loyalty-bridge',
      type: 'major-reward',
      title: 'Loyalty Bridge Badge',
      label: 'Loyalty Token',
      image: 'assets/badges/loyalty/loyalty-bridge-token.png',
      fallback: 'LB',
      ribbon: 'Loyalty Reward Earned',
      frontNote: 'A future reward is waiting at the crossing.',
      backTitle: 'Loyalty Token Secured',
      backCopy: 'Congrats! We can cross this bridge at any future visit. This Loyalty Token will rest in your Depot until you’re ready to redeem.',
      meta: 'Reward token · Redeem later',
      major: true,
      sound: true
    },
    {
      id: 'wing-man',
      type: 'food-badge',
      title: 'Wing Man',
      label: 'Food Category Badge',
      image: 'assets/badges/food/wing-man.png',
      fallback: 'WM',
      ribbon: 'Badge Earned',
      frontNote: 'You made a proper wing run.',
      backTitle: 'Wing Man Earned',
      backCopy: 'You backed the right bird. This badge celebrates a trip that leaned into sauces built for wings, drums, flats, and game-day plates.',
      meta: 'Earned today · Food category achievement',
      major: false,
      sound: false
    },
    {
      id: 'bottle-purchase-coin',
      type: 'purchase-progress',
      title: 'Bottle Purchase Coin',
      label: 'Trip Progress',
      image: 'assets/badges/purchase-progress/bottle-purchase-coin.png',
      fallback: 'BP',
      ribbon: 'Badge Earned',
      frontNote: 'This trip crossed the bottle-count mark.',
      backTitle: 'Bottle Count Achievement',
      backCopy: 'This badge marks the bottles earned during this trip. The cart teased the progress. This is the completed card reveal.',
      meta: 'Trip achievement · Level-up rule ready',
      major: false,
      sound: false
    }
  ];

  var nearMissBadges = [
    {
      title: 'Badge in Your Grasp',
      copy: 'One more bottle keeps this achievement from leaving the platform.',
      cta: 'Return to shop before this trip closes'
    }
  ];

  var soundMuted = false;
  var soundAttempted = false;

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function createEl(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
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
      var ringBtn = createEl('button', 'pj-ring-btn', 'Ring the Bell');
      ringBtn.type = 'button';

      ringBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        playBell(true);
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

    if (!grid) return;

    grid.innerHTML = '';

    earnedBadges.forEach(function(badge) {
      grid.appendChild(renderBadgeCard(badge));
    });

    if (count) {
      count.textContent = earnedBadges.length + ' Earned';
    }
  }

  function renderNearMiss() {
    var section = qs('#badge-in-your-grasp');
    var grid = qs('#grasp-grid');

    if (!section || !grid) return;

    /*
      Keep hidden unless current session has a true near-miss.
      Future rule:
      show only if under $10 away OR exactly one bottle away.
    */
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
      link.href = 'index.html';
      link.style.marginTop = '16px';

      card.appendChild(link);
      grid.appendChild(card);
    });
  }

  function setupCustomerState() {
    var shell = qs('.pj-postpay-shell');

    if (!shell) return;

    /*
      Prototype toggle:
      Add ?signedIn=1 to preview the signed-in automatic-save state.
      Default shows signed-out claim/save prompt.
    */
    var params = new URLSearchParams(window.location.search);

    if (params.get('signedIn') === '1') {
      shell.dataset.customerState = 'signed-in';
    } else {
      shell.dataset.customerState = 'signed-out';
    }
  }

  function setupSoundToggle() {
    var btn = qs('.pj-sound-toggle');

    if (!btn) return;

    btn.addEventListener('click', function() {
      soundMuted = !soundMuted;
      btn.setAttribute('aria-pressed', soundMuted ? 'true' : 'false');
      btn.textContent = soundMuted ? 'Sound: Off' : 'Sound: On';
    });
  }

  function playBell(userRequested) {
    if (soundMuted) return;

    var audio = qs('#pj-badge-bell');

    if (!audio) return;

    try {
      audio.currentTime = 0;

      var playPromise = audio.play();

      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(function() {
          if (!userRequested) {
            /*
              Browser blocked autoplay.
              The Ring the Bell button remains available on major badge backs.
            */
          }
        });
      }
    } catch (err) {}
  }

  function tryMajorRewardSoundOnce() {
    if (soundAttempted) return;

    soundAttempted = true;

    var hasMajorSound = earnedBadges.some(function(badge) {
      return badge.sound;
    });

    if (!hasMajorSound) return;

    /*
      Browser may block this.
      If blocked, customer can use Ring the Bell on the card back.
    */
    setTimeout(function() {
      playBell(false);
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
