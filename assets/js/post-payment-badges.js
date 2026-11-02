(function() {
  'use strict';

  var GOOGLE_REVIEW_URL = 'https://g.page/r/CTI8YAonEJngEBM/review';

  // Empty until the authenticated, checkout-scoped server response is verified.
  var earnedBadges = [];
  var nearMissBadges = [];
  var checkoutOrderRef = captureCheckoutOrderRef();
  var PRODUCTION_URL = 'https://cdbenwthxhypuuipyjlv.supabase.co';
  var TESTING_URL = 'https://slubpfmpjgoupujptayy.supabase.co';

  function validOrderId(id) {
    return typeof id === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(id);
  }

  // Capture BEFORE the existing cart-clear script finishes its asynchronous
  // confirmation. Stored reference is merely a lookup hint, NOT payment proof.
  function captureCheckoutOrderRef() {
    try {
      var pending = JSON.parse(sessionStorage.getItem('pj_checkout_pending') || 'null');
      if (pending && validOrderId(pending.order_id)) {
        sessionStorage.setItem('pj_postpay_order_ref', JSON.stringify({
          order_id: pending.order_id, captured_at: Date.now()
        }));
        return pending.order_id;
      }
      var saved = JSON.parse(sessionStorage.getItem('pj_postpay_order_ref') || 'null');
      if (saved && validOrderId(saved.order_id) &&
          Number.isFinite(saved.captured_at) && saved.captured_at <= Date.now() &&
          Date.now() - saved.captured_at <= 90 * 60 * 1000) {
        return saved.order_id;
      }
      sessionStorage.removeItem('pj_postpay_order_ref');
    } catch (_) { /* Browser storage unavailable; never invent a checkout ID. */ }
    return null;
  }

  var soundMuted = false;
  var soundAttempted = false;
  var awardsRequestSerial = 0;
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
    img.alt = badge.title;
    if (badge.image) {
      img.src = badge.image;
    } else {
      img.hidden = true;
      img.style.display = 'none';
    }

    var placeholder = createEl('div', 'pj-award-placeholder', badge.fallback || 'PJ');

    img.addEventListener('error', function() {
      img.style.display = 'none';
      placeholder.style.display = 'flex';
    });

    artWrap.appendChild(img);
    if (!badge.image) placeholder.style.display = 'flex';
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
      count.textContent = earnedBadges.length + ' Earned';
    }
  }

  function renderNearMiss() {
    var section = qs('#badge-in-your-grasp');
    var grid = qs('#grasp-grid');

    if (!section || !grid) {
      return;
    }

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

      var link = createEl('a', 'pj-btn pj-btn-primary', item.cta || 'Explore More Sauces');
      link.href = 'main.html';
      link.style.marginTop = '16px';

      card.appendChild(link);
      grid.appendChild(card);
    });
  }

  function setAwardsStatus(message, allowRetry) {
    var status = qs('#postpay-awards-message');
    var retry = qs('#postpay-awards-retry');
    if (status) status.textContent = message;
    if (retry) retry.hidden = !allowRetry;
  }

  function verifiedAwardsContext() {
    // The customer-facing website uses the SAME Production Auth client as
    // account.html and Passenger Station. Never trust a browser-supplied UID.
    var host = window.location.hostname.toLowerCase();
    var official = host === 'pepperjunction401.com' ||
      host === 'www.pepperjunction401.com';
    var testingHost = host === 'pepperjunction401-beep.github.io' ||
      host === 'localhost' || host === '127.0.0.1';
    var path = window.location.pathname || '';
    // An isolated, explicitly named test harness is the ONLY permitted place
    // to use Testing credentials. Production pages never load that client.
    if (testingHost && /(?:^|\/)post-payment-badges-testing\.html$/.test(path)) {
      var isolated = window.PJPostPaymentTestingAuth;
      var testingClient = isolated && isolated.client;
      if (testingClient && testingClient.supabaseUrl === TESTING_URL &&
          testingClient.auth && testingClient.functions) {
        return { client: testingClient, testing: true };
      }
      return null;
    }
    if (!official) return null; // GitHub/local previews cannot query Production.
    var auth = window.PJAuth;
    var client = auth && auth.client;
    if (!auth || !auth.enabled || !client || client.supabaseUrl !== PRODUCTION_URL ||
        !client.auth || !client.functions) return null;
    return { client: client, testing: false };
  }

  async function loadPostPaymentAwards() {
    var currentRequest = ++awardsRequestSerial;
    var shell = qs('.pj-postpay-shell');
    if (shell) shell.dataset.customerState = 'signed-out';
    earnedBadges = [];
    nearMissBadges = [];
    renderEarnedBadges();
    renderNearMiss();

    // A Square redirect or browser storage alone never proves a purchase.
    if (!checkoutOrderRef) {
      setAwardsStatus('No checkout reference is available in this browser session. We cannot verify awards without one.', false);
      return;
    }
    var projector = window.PJPostPaymentAwardRead;
    if (!projector || typeof projector.projectEventAwards !== 'function') {
      setAwardsStatus('The awards display is temporarily unavailable.', true);
      return;
    }
    var context = verifiedAwardsContext();
    if (!context) {
      setAwardsStatus('Secure award verification is unavailable on this preview. Customer accounts are only used on the official website; isolated Testing has its own separate test page.', false);
      return;
    }
    var client = context.client;
    setAwardsStatus('Checking your completed checkout and new badge awards…', false);
    try {
      var userResponse = await client.auth.getUser();
      if (currentRequest !== awardsRequestSerial) return;
      if (userResponse.error || !userResponse.data || !userResponse.data.user ||
          userResponse.data.user.is_anonymous === true ||
          !userResponse.data.user.email_confirmed_at) {
        setAwardsStatus(context.testing
          ? 'Sign in with a verified isolated Testing account to check this purchase.'
          : 'Sign in to your Pepper Junction account to view awards verified for this checkout.', false);
        return;
      }
      var response = await client.functions.invoke('post-payment-awards-read', {
        body: { square_order_id: checkoutOrderRef }
      });
      if (currentRequest !== awardsRequestSerial) return;
      if (response.error) throw response.error;
      var data = projector.projectEventAwards(response.data, {
        type: 'checkout', id: checkoutOrderRef
      });

      if (data.status === 'pending') {
        if (shell) shell.dataset.customerState = 'pending';
        setAwardsStatus(context.testing
          ? 'This checkout has not been attached in isolated Testing. No award has been claimed.'
          : 'Your purchase is being confirmed and your badges are being recorded. Use Check Again shortly.', true);
        return;
      }
      if (data.status !== 'ready') {
        setAwardsStatus('Verified awards are not available yet. Please try again.', true);
        return;
      }
      if (shell) shell.dataset.customerState = 'signed-in';
      earnedBadges = data.awards;
      nearMissBadges = data.nearMisses;
      renderEarnedBadges();
      renderNearMiss();
      var eyebrow = qs('#postpay-checkout-state');
      if (eyebrow) eyebrow.textContent = 'Order Confirmed';
      var title = qs('#postpay-title');
      if (title) title.textContent = earnedBadges.length ? 'Badges Earned' : 'Checkout Verified';
      setAwardsStatus(earnedBadges.length
        ? 'These achievements were verified for this checkout.'
        : 'This checkout is verified. No new badges have been recorded for this purchase.', false);
      tryMajorRewardSoundOnce();
    } catch (_) {
      if (currentRequest !== awardsRequestSerial) return;
      setAwardsStatus('We could not verify this checkout’s badges right now. No awards have been assumed or displayed.', true);
    }
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

  window.PJPostPaymentReloadAwards = loadPostPaymentAwards;

  document.addEventListener('DOMContentLoaded', function() {
    setupSoundToggle();
    renderEarnedBadges();
    renderNearMiss();
    var retry = qs('#postpay-awards-retry');
    if (retry) retry.addEventListener('click', loadPostPaymentAwards);
    loadPostPaymentAwards();

    /*
      Preserve Google Review link in one place for later wiring/reference.
    */
    window.PJ_GOOGLE_REVIEW_URL = GOOGLE_REVIEW_URL;
  });
})();
