/**
 * pj-product-review.js
 * Pepper Junction — Shared Product-Page Review Integration v1 (Prototype)
 *
 * Owns on the product page:
 *   - Review button binding
 *   - People's Choice Rating summary display
 *   - Approved customer-line display (left-side scroll)
 *
 * Does NOT own:
 *   - Questionnaire wording, scoring, or submission
 *   - Authentication, purchase verification, or eligibility logic
 *   - Moderation, badge thresholds, or aggregate math
 *   - Direct Supabase or Square access
 *
 * Phase 3 prototype: ships with mock data. Phase 6 swaps in live calls.
 * Fails silently. If anything is missing, the product page must remain usable.
 */

(function () {
  'use strict';

  /* ── CONFIG ─────────────────────────────────────────────── */
  var SHARED_REVIEW_PAGE = '../review.html';
  var TWO_OR_MORE_SYMBOLS = /[!@#$%^&*()_+={}\[\]|\\:;"'<>,.?/~`]{2,}/;

  var state = {
    productSlug:        null,
    reviewButtonId:     null,
    summaryContainerId: null,
    customerLineId:     null,
    lineShown:          false,
    customerLinePool:   [],
    dismissTimer:       null
  };

  /* ── INIT ───────────────────────────────────────────────── */
  function init(opts) {
    if (!opts || !opts.productSlug) {
      console.warn('PJProductReview: init requires productSlug.');
      return;
    }

    state.productSlug        = opts.productSlug;
    state.reviewButtonId     = opts.reviewButtonId     || 'pj-review';
    state.summaryContainerId = opts.summaryContainerId || 'pj-peoples-choice';
    state.customerLineId     = opts.customerLineId     || 'customer-line';

    bindReviewButton();
    loadSummary();
    prefetchCustomerLines();
    bindCustomerLineDismissal();
  }

  /* ══════════════════════════════════════════════════════════
     REVIEW BUTTON
     ══════════════════════════════════════════════════════════ */
  function bindReviewButton() {
    var btn = document.getElementById(state.reviewButtonId);
    if (!btn) return;

    /* Enable button only after init succeeds */
    btn.disabled = false;
    btn.setAttribute('aria-disabled', 'false');

    btn.addEventListener('click', handleReviewClick);
  }

  function handleReviewClick() {
    /*
     * Phase 6 will replace this with real eligibility checks:
     *   1. Is the customer signed in? (if not → sign-in flow)
     *   2. Did they purchase via eligible Square transaction?
     *   3. Have they already reviewed this product?
     *   4. Is the shared review page available?
     *
     * Phase 3 prototype: route straight through to the shared review page.
     * Supabase/Square eligibility checks are NOT connected yet.
     */
    var url = SHARED_REVIEW_PAGE + '?product=' + encodeURIComponent(state.productSlug);
    window.location.href = url;
  }

  /* ══════════════════════════════════════════════════════════
     PEOPLE'S CHOICE RATING SUMMARY
     ══════════════════════════════════════════════════════════ */
  function loadSummary() {
    /*
     * Phase 6 will fetch the approved aggregate from Supabase.
     * Phase 3 prototype: no aggregate yet → leave container hidden.
     *
     * When live, expected shape:
     *   { rating: 4.25, count: 38 }
     * Quarter-star values only: 3.00, 3.25, 3.50, ..., 5.00
     */
    var aggregate = getMockAggregate(state.productSlug);
    if (!aggregate || !aggregate.count) return;

    renderSummary(aggregate);
  }

  function renderSummary(agg) {
    var container = document.getElementById(state.summaryContainerId);
    if (!container) return;

    var starsEl = document.getElementById('pj-peoples-choice-stars');
    var valueEl = document.getElementById('pj-peoples-choice-value');
    var countEl = document.getElementById('pj-peoples-choice-count');

    if (starsEl) starsEl.textContent = buildStars(agg.rating);
    if (valueEl) valueEl.textContent = agg.rating.toFixed(2) + ' People\u2019s Choice';
    if (countEl) {
      countEl.textContent = '(' + agg.count + ' verified review' + (agg.count === 1 ? '' : 's') + ')';
    }

    container.hidden = false;
  }

  function buildStars(rating) {
    var full  = Math.floor(rating);
    var frac  = rating - full;
    var stars = '';
    for (var i = 0; i < full; i++) stars += '\u2605';
    if (frac >= 0.75)      stars += '\u2605';
    else if (frac >= 0.5)  stars += '\u00BD';
    else if (frac >= 0.25) stars += '\u00BC';
    while (stars.replace(/[\u00BC\u00BD]/g, '').length + (stars.indexOf('\u00BC') > -1 || stars.indexOf('\u00BD') > -1 ? 1 : 0) < 5) {
      stars += '\u2606';
    }
    return stars;
  }

  /* ══════════════════════════════════════════════════════════
     CUSTOMER LINE
     ══════════════════════════════════════════════════════════ */
  function prefetchCustomerLines() {
    /*
     * Phase 6 will fetch approved public customer lines from the restricted
     * Supabase view. Response should contain only:
     *   - line text
     *   - customer first name
     *   - current Railroad Passenger class
     *   - product slug
     *   - prompt type
     *
     * Phase 3 prototype: empty pool. Customer line will not appear
     * until live data lands. This is correct behavior per the brief:
     * "If no approved line exists, nothing appears."
     */
    state.customerLinePool = getMockCustomerLines(state.productSlug);
  }

  function showCustomerLine() {
    if (state.lineShown) return;

    var pool = state.customerLinePool.filter(isLineSafe);
    if (!pool.length) return;  /* Brief rule: empty pool → nothing appears */

    var line = pool[Math.floor(Math.random() * pool.length)];
    var container = document.getElementById(state.customerLineId);
    if (!container) return;

    var textEl = document.getElementById('customer-line-text');
    var attrEl = document.getElementById('customer-line-attr');

    /* Brief rule: insert text with textContent, NOT innerHTML */
    if (textEl) textEl.textContent = line.text || '';
    if (attrEl) attrEl.textContent = '\u2014 ' + (line.firstName || '') + ', ' + (line.passengerClass || '');

    container.classList.add('visible');
    state.lineShown = true;

    /* Auto-dismiss after 15 seconds to mirror bartender behavior */
    if (state.dismissTimer) clearTimeout(state.dismissTimer);
    state.dismissTimer = setTimeout(hideCustomerLine, 15000);
  }

  function hideCustomerLine() {
    var container = document.getElementById(state.customerLineId);
    if (container) container.classList.remove('visible');
    if (state.dismissTimer) {
      clearTimeout(state.dismissTimer);
      state.dismissTimer = null;
    }
  }

  function isLineSafe(line) {
    if (!line || !line.text) return false;
    /* Brief rule: reject runs of 2+ adjacent symbols */
    if (TWO_OR_MORE_SYMBOLS.test(line.text)) return false;
    return true;
  }

  function bindCustomerLineDismissal() {
    var container = document.getElementById(state.customerLineId);
    if (!container) return;

    /* Tap to dismiss */
    container.addEventListener('click', hideCustomerLine);

    /* Swipe-left to dismiss (mirrors bartender pattern, opposite direction) */
    var touchStartX = 0;
    container.addEventListener('touchstart', function (e) {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });

    container.addEventListener('touchend', function (e) {
      var diff = e.changedTouches[0].clientX - touchStartX;
      if (diff < -40) hideCustomerLine();
    }, { passive: true });
  }

  /* ══════════════════════════════════════════════════════════
     MOCK DATA — Phase 3 prototype only
     Replace in Phase 6 with live Supabase calls.
     ══════════════════════════════════════════════════════════ */
  function getMockAggregate(/* slug */) {
    /* Return null until live data is connected. */
    return null;
  }

  function getMockCustomerLines(/* slug */) {
    /* Return [] until live data is connected. */
    return [];
  }

  /* ══════════════════════════════════════════════════════════
     PUBLIC API
     ══════════════════════════════════════════════════════════ */
  window.PJProductReview = {
    init:             init,
    showCustomerLine: showCustomerLine,
    hideCustomerLine: hideCustomerLine
  };

})();
