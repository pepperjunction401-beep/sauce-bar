/* Pepper Junction — event-attributed awards presentation contract.
 *
 * READ-ONLY / PRESENTATION ONLY. No queries, no badge evaluation, no awarding.
 *
 * The caller MUST obtain the response from an authenticated server endpoint
 * that verifies customer ownership and event attribution. This browser module
 * does not and cannot establish checkout ownership or payment authenticity.
 *
 * Expected response:
 * {
 *   status: 'ready' | 'pending' | 'unavailable',
 *   event: { type: 'checkout' | 'review' | 'event' | ..., id: 'trusted-event-id' },
 *   awards: [{
 *     family: 'food', code: 'wing_man', title: 'Wing Man',
 *     attribution: { type: 'checkout', id: 'trusted-event-id' },
 *     level: 1, label: 'Food Badge', image: 'assets/badges/...',
 *     description: '...', major: false
 *   }],
 *   nearMisses: []
 * }
 *
 * The event identifies WHAT earned an award, not the device/channel it came
 * from. Website, Square and future-app clients may use the same contract.
 *
 * This module is intentionally NOT loaded by post-payment-badges.html yet.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PJPostPaymentAwardRead = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var adapters = Object.create(null);
  var familyPattern = /^[a-z][a-z0-9_-]{0,63}$/;

  function eventMatches(value, expected) {
    return !!(value && expected &&
      typeof value.type === 'string' && typeof value.id === 'string' &&
      value.type === expected.type && value.id === expected.id);
  }

  function cleanText(value, max) {
    return typeof value === 'string' ? value.trim().slice(0, max || 240) : '';
  }

  function isLocalBadgeArt(value) {
    return typeof value === 'string' &&
      /^assets\/badges\/[a-zA-Z0-9_./-]+\.(?:png|webp|jpe?g|svg)$/.test(value) &&
      !value.split('/').includes('..');
  }

  // A future badge family can register a display adapter, without changing
  // this module or any existing badge engine.
  function registerFamily(family, toCard) {
    if (typeof family !== 'string' || !familyPattern.test(family) ||
        typeof toCard !== 'function') throw new TypeError('Invalid family adapter');
    if (adapters[family]) throw new Error('Family adapter already registered: ' + family);
    adapters[family] = toCard;
  }

  // Generic cards work for any new family that supplies verified display data.
  // Family adapters are optional, for specialized card presentation only.
  function genericCard(award) {
    var title = cleanText(award.title, 120);
    var family = cleanText(award.family, 64);
    var code = cleanText(award.code, 120);
    if (!title || !familyPattern.test(family) || !code) return null;
    return {
      id: family + ':' + code + (Number.isInteger(award.level) ? ':' + award.level : ''),
      family: family,
      code: code,
      level: Number.isInteger(award.level) && award.level > 0 ? award.level : null,
      title: title,
      label: cleanText(award.label, 120) || family.replace(/_/g, ' '),
      image: isLocalBadgeArt(award.image) ? award.image : '',
      fallback: cleanText(award.fallback, 4) || 'PJ',
      ribbon: cleanText(award.ribbon, 80) || 'Badge Earned',
      frontNote: cleanText(award.frontNote, 180),
      backTitle: cleanText(award.backTitle, 120) || title,
      backCopy: cleanText(award.description, 600),
      meta: cleanText(award.meta, 140),
      major: award.major === true,
      sound: award.sound === true
    };
  }

  // Every result is restricted to the server-verified earning event.
  // A review award cannot appear as part of an unrelated checkout.
  function projectEventAwards(response, expectedEvent) {
    if (!expectedEvent || !cleanText(expectedEvent.type, 64) ||
        !cleanText(expectedEvent.id, 240)) throw new TypeError('Expected event required');
    if (!response || !eventMatches(response.event, expectedEvent)) {
      throw new Error('Awards response does not match the requested event');
    }
    if (response.status === 'pending' || response.status === 'unavailable') {
      return { status: response.status, event: expectedEvent, awards: [], nearMisses: [] };
    }
    if (response.status !== 'ready' || !Array.isArray(response.awards)) {
      throw new Error('Awards response is not ready or malformed');
    }

    var cards = [];
    response.awards.forEach(function (award) {
      if (!award || !eventMatches(award.attribution, expectedEvent)) {
        // Fail closed: never silently claim an unrelated award was earned here.
        throw new Error('Award attribution mismatch');
      }
      var base = genericCard(award);
      if (!base) throw new Error('Malformed award presentation');
      var adapter = adapters[base.family];
      var card = adapter ? adapter(Object.freeze(Object.assign({}, base)), award) : base;
      if (!card || typeof card !== 'object') throw new Error('Invalid family card adapter');
      cards.push(card);
    });

    // Progress is never inferred from an award count or browser timestamps.
    // Only trusted server-calculated near-misses may be shown.
    var nearMisses = Array.isArray(response.nearMisses) ?
      response.nearMisses.filter(function (n) {
        return n && eventMatches(n.attribution, expectedEvent) &&
          typeof n.title === 'string' && typeof n.description === 'string';
      }).map(function (n) {
        var family = cleanText(n.family, 64);
        var code = cleanText(n.badge_code, 120);
        var card = {
          title: cleanText(n.title, 120),
          copy: cleanText(n.description, 600),
          family: familyPattern.test(family) ? family : '',
          code: /^[a-z0-9_-]{1,120}$/.test(code) ? code : ''
        };
        // Meter evidence must be typed, bounded, positive and server-sourced.
        // Old responses lacking these fields remain text-only, not guessed.
        if ((family === 'food' || family === 'heat_identity') &&
            Number.isSafeInteger(n.current_quantity) &&
            Number.isSafeInteger(n.target_quantity) &&
            n.target_quantity > 0 && n.target_quantity <= 1000000 &&
            n.current_quantity >= 0 && n.current_quantity < n.target_quantity &&
            n.remaining_quantity === n.target_quantity - n.current_quantity) {
          card.progress = { current: n.current_quantity, target: n.target_quantity, unit: 'bottles' };
          card.remaining = n.remaining_quantity;
          if (family === 'food' &&
              Number.isSafeInteger(n.level_step) && n.level_step >= 2 &&
              n.level_step <= 12 &&
              Number.isSafeInteger(n.level_completed) &&
              n.level_completed >= 0 && n.level_completed < n.level_step &&
              n.level_completed === n.current_quantity - (n.target_quantity - n.level_step)) {
            card.levelProgress = { count: n.level_step, completed: n.level_completed };
          }
        } else if (family === 'purchase_progress' &&
            Number.isSafeInteger(n.current_cents) &&
            Number.isSafeInteger(n.target_cents) &&
            n.target_cents > 0 && n.target_cents <= 100000000 &&
            n.current_cents >= 0 && n.current_cents < n.target_cents &&
            n.remaining_cents === n.target_cents - n.current_cents) {
          card.progress = { current: n.current_cents, target: n.target_cents, unit: 'cents' };
          card.remaining = n.remaining_cents;
        }
        return card;
      }) : [];

    return { status: 'ready', event: expectedEvent, awards: cards, nearMisses: nearMisses };
  }

  return Object.freeze({
    registerFamily: registerFamily,
    projectEventAwards: projectEventAwards
  });
});
