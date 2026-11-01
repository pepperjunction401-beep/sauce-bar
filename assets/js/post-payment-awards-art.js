/* Pepper Junction — presentation-only artwork adapters.
 * Existing award engines and award records remain authoritative.
 * Add future families here (or in their own adapter file) after their data
 * endpoints provide verified event-attributed achievements.
 */
(function () {
  'use strict';
  var api = window.PJPostPaymentAwardRead;
  if (!api || typeof api.registerFamily !== 'function') return;

  function nameFromCode(code) {
    return String(code || '').replace(/[_-]+/g, ' ').replace(/\b\w/g,
      function(letter) { return letter.toUpperCase(); });
  }
  function present(base, patch) { return Object.assign({}, base, patch); }
  function art(folder, filename) { return 'assets/badges/' + folder + '/' + filename; }

  api.registerFamily('heat_identity', function(base) {
    var hit = /^heat_identity_(mild|medium|hot|very_hot|super_hot|extreme|inferno)_l([1-3])$/.exec(base.code);
    if (!hit) return base;
    var lane = hit[1].replace(/_/g, '-'), level = Number(hit[2]);
    return present(base, {
      title: nameFromCode(hit[1]) + ' · Level ' + level,
      image: art('heat', (level === 1 ? '' : 'L' + level + '-') + 'badge-' + lane + '.png'),
      label: 'Heat Identity',
      meta: 'Heat Identity · Level ' + level
    });
  });

  var foodTitles = {
    asian: 'Wok Star', bbq: 'Smoking Section',
    breakfast: 'This Is Your Brain on Hot Sauce', cajun: 'Marty Bras',
    caribbean: 'Is This Love', condiments: 'Flavor Junkie',
    fruit: 'Fruity Pants', garlic: 'Garlic Breath', indian: 'Curry On',
    mediterranean: 'Olive Oil & Vin – Ch. 1', mexican: 'Muy Rico!',
    seafood: 'Shore Dinner Regular', seasonings: 'Flavortown Mayor',
    snacks: 'Snack Shack', taco: 'Taco Fever', veggies: 'The Veggie Outlaws',
    verde: 'Señor Verde', wings: 'Epic Wingman'
  };
  api.registerFamily('food', function(base) {
    var hit = /^food_([a-z_]+)$/.exec(base.code);
    if (!hit) return base;
    var category = hit[1];
    return present(base, {
      title: foodTitles[category] || base.title,
      image: art('food', 'badge-food-' + category.replace(/_/g, '-') + '.png'),
      label: 'Food Category Badge',
      meta: base.level ? 'Food Badge · Level ' + base.level : 'Food Badge'
    });
  });

  var purchaseArt = {
    fill_er_up: 'fuel', speakeasy: 'spirits', sauce_director: 'movies',
    broadcast: 'radio', market_run: 'groceries', free_shipping: 'free-shipping',
    distance_rider: 'taxi', rock_like_a_doc: 'doctor',
    there_goes_the_house: 'mortgage', hot_sauce_over_a_yacht: 'boat'
  };
  api.registerFamily('purchase_progress', function(base) {
    var filename = purchaseArt[base.code];
    if (!filename) return base;
    return present(base, {
      image: art('purchase-progress', 'badge-purchase-progress-' + filename + '.png'),
      label: 'Purchase Progress',
      major: base.code === 'free_shipping',
      sound: base.code === 'free_shipping',
      ribbon: base.code === 'free_shipping' ? 'Major Reward Earned' : 'Badge Earned',
      meta: base.level ? 'Purchase Progress · Level ' + base.level : 'Purchase Progress'
    });
  });

  var coinArt = {
    wheat_penny: 'penny', buffalo_nickel: 'nickel', mercury_dime: 'dime',
    standing_liberty_quarter: 'quarter', walking_liberty_half_dollar: 'half-dollar',
    peace_dollar: 'peace-dollar'
  };
  api.registerFamily('bottle_coin', function(base) {
    var filename = coinArt[base.code];
    if (!filename) return base;
    return present(base, {
      image: art('bottle-purchase-coins', 'badge-coin-' + filename + '-obverse.png'),
      title: nameFromCode(base.code),
      label: 'Bottle Coin',
      meta: base.level ? 'Bottle Coin · ×' + base.level : 'Bottle Coin'
    });
  });

  var roundArt = {
    early_bird: 'early-bird', lunch_hour: 'lunch-rush',
    evening_commute: 'evening-commute', late_night: 'late-night',
    night_owl: 'night-owl'
  };
  api.registerFamily('round_clock', function(base) {
    var filename = roundArt[base.code];
    if (!filename) return base;
    return present(base, {
      image: art('shop-oround-the-clock', 'badge-shop-oround-the-clock-' + filename + '.png'),
      title: nameFromCode(base.code),
      label: "Shop O'Round the Clock"
    });
  });

  var signs = [
    'capricorn', 'aquarius', 'pisces', 'aries', 'taurus', 'gemini',
    'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius'
  ];
  api.registerFamily('celestial', function(base) {
    var hit = /^(20\d{2})-(0[1-9]|1[0-2])$/.exec(base.code);
    if (!hit) return base;
    var year = Number(hit[1]), month = Number(hit[2]);
    return present(base, {
      title: nameFromCode(signs[month - 1]) + ' · ' + year,
      image: year === 2026 ?
        art('celestial', 'badge-celestial-' + signs[month - 1] + '-2026.png') : '',
      label: 'Celestial · ' + year
    });
  });
})();
