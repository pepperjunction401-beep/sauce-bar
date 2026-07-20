/* ═══════════════════════════════════════════════════════════════════
   PEPPER JUNCTION — REVIEW DATA LAYER (MOCK)
   assets/js/pj-review-data.js

   This file is the ONLY place review.html touches for customer,
   eligibility, submission, and personal-rating data. Every function
   is shaped to the future Supabase contract. When Supabase goes
   live, this file is replaced with real calls — review.html itself
   never changes.

   The UI never decides eligibility, verified purchases, moderation,
   People's Choice aggregates, or badge progress. It only asks.

   Dev state switching (build phase only):
     review.html?product=<slug>&state=ELIGIBLE
     States: ELIGIBLE | NOT_SIGNED_IN | NOT_PURCHASED |
             ALREADY_REVIEWED | SUBMITTED | ERROR
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── CNS PRODUCT DATA (mock snapshot of Database_Pepper_Junction v7.1)
     Live version reads the real CNS — the Database is the Bible. ── */
  var CNS_PRODUCTS = {"13-stars-dragons-breath":{"name":"Dragon’s Breath","brand":"13 Stars","size":"5 oz.","category":"HOT SAUCE","foodStyle":"Asian","pepperType":"Jalapeño","heatCategory":"Mild"},"cajohns-la-segadora-carolina-reaper":{"name":"La Segadora Carolina Reaper","brand":"CaJohns","size":"5 oz.","category":"HOT SAUCE","foodStyle":"Mexican","pepperType":"Reaper","heatCategory":"Extreme"},"dirty-dicks-hot-tropical-hot-sauce":{"name":"Hot Tropical Hot Sauce","brand":"Dirty Dick's","size":"5 oz.","category":"HOT SAUCE","foodStyle":"Caribbean","pepperType":"Habanero","heatCategory":"Very Hot"},"ghost-scream":{"name":"Ghost Scream","brand":"Ghost Scream","size":"5 oz.","category":"HOT SAUCE","foodStyle":"Southwestern","pepperType":"Ghost Pepper","heatCategory":"Super Hot"},"heartbreaking-dawns-the-green":{"name":"The Green","brand":"Heartbreaking Dawn's","size":"5 oz.","category":"HOT SAUCE","foodStyle":"Mexican","pepperType":"Jalapeño","heatCategory":"Hot"},"high-river-sauces-hellacious":{"name":"Hellacious","brand":"High River Sauces","size":"5 oz.","category":"HOT SAUCE","foodStyle":"Mexican","pepperType":"Chipotle, jalapeno","heatCategory":"Hot"},"high-river-sauces-psych-sauce":{"name":"Psych Sauce","brand":"High River Sauces","size":"5 oz.","category":"HOT SAUCE","foodStyle":"Cajun","pepperType":"Cayenne","heatCategory":"Hot"},"high-river-sauces-foo-foo-mama-choo":{"name":"Foo Foo Mama Choo","brand":"High River Sauces","size":"5 oz.","category":"HOT SAUCE","foodStyle":"Asian","pepperType":"Reaper","heatCategory":"Extreme"},"high-river-sauces-peppers-up":{"name":"Peppers Up","brand":"High River Sauces","size":"5 oz.","category":"HOT SAUCE","foodStyle":"Fruit","pepperType":"Apollo","heatCategory":"Inferno"},"high-river-sauces-rogue":{"name":"Rogue","brand":"High River Sauces","size":"5 oz.","category":"HOT SAUCE","foodStyle":"Caribbean","pepperType":"Scorpion","heatCategory":"Super Hot"},"high-river-sauces-tears-of-the-sun":{"name":"Tears of the Sun","brand":"High River Sauces","size":"5 oz.","category":"HOT SAUCE","foodStyle":"Caribbean","pepperType":"Habanero","heatCategory":"Medium"},"high-river-sauces-thunder-juice":{"name":"Thunder Juice","brand":"High River Sauces","size":"5 oz.","category":"HOT SAUCE","foodStyle":"Fruit","pepperType":"Reaper","heatCategory":"Extreme"},"high-river-sauces-taco-x":{"name":"Taco X","brand":"High River Sauces","size":"5 oz.","category":"HOT SAUCE","foodStyle":"Mexican","pepperType":"Pepper X","heatCategory":"Inferno"},"hells-kitchen-cinnamon-ghost":{"name":"Cinnamon Ghost","brand":"Hell’s Kitchen","size":"5 oz.","category":"HOT SAUCE","foodStyle":"Indian","pepperType":"Ghost Pepper","heatCategory":"Super Hot"},"hells-kitchen-coconut-curry":{"name":"Coconut Curry","brand":"Hell’s Kitchen","size":"5 oz.","category":"HOT SAUCE","foodStyle":"Caribbean","pepperType":"Scotch Bonnet","heatCategory":"Hot"},"hells-kitchen-black-forest":{"name":"Black Forest","brand":"Hell’s Kitchen","size":"5 oz.","category":"HOT SAUCE","foodStyle":"Mediterranean","pepperType":"Ghost Pepper","heatCategory":"Very Hot"},"sauce-crafters-hogs-ass-garlic-habanero-sauce":{"name":"Hog's Ass Garlic Habanero Sauce","brand":"Sauce Crafters","size":"5 oz.","category":"HOT SAUCE","foodStyle":"American","pepperType":"Habanero","heatCategory":"Very Hot"},"ashley-foods-mad-dog-sriracha":{"name":"Mad Dog Sriracha","brand":"Ashley Foods","size":"5 oz.","category":"HOT SAUCE","foodStyle":"Asian","pepperType":"Reaper","heatCategory":"Extreme"},"melindas-mango-habanero":{"name":"Mango Habanero","brand":"Melinda's","size":"5 oz.","category":"HOT SAUCE","foodStyle":"Fruit","pepperType":"Habanero","heatCategory":"Medium"},"melindas-original-naga-jolokia":{"name":"Original Naga Jolokia","brand":"Melinda's","size":"5 oz.","category":"HOT SAUCE","foodStyle":"Caribbean","pepperType":"Ghost Pepper","heatCategory":"Super Hot"},"melindas-scotch-bonnet-sauce":{"name":"Scotch Bonnet Sauce","brand":"Melinda's","size":"5 oz.","category":"HOT SAUCE","foodStyle":"Caribbean","pepperType":"Scotch Bonnet","heatCategory":"Hot"},"mikey-vs-i-love-taco-sauce-hot":{"name":"I love Taco Sauce Hot","brand":"Mikey V's","size":"5 oz.","category":"HOT SAUCE","foodStyle":"Mexican","pepperType":"Habanero","heatCategory":"Hot"},"mikey-vs-jalapeno-dill-pickle":{"name":"Jalapeno Dill Pickle","brand":"Mikey V's","size":"5 oz.","category":"HOT SAUCE","foodStyle":"Mexican","pepperType":"Jalapeño","heatCategory":"Mild"},"mikey-vs-reaper-jalapeno-dill-pickle":{"name":"Reaper Jalapeno Dill Pickle","brand":"Mikey V's","size":"5 oz.","category":"HOT SAUCE","foodStyle":"Mexican","pepperType":"Reaper, jalapeno","heatCategory":"Extreme"},"mikey-vs-ghostly-garlic":{"name":"Ghostly Garlic","brand":"Mikey V's","size":"5 oz.","category":"HOT SAUCE","foodStyle":"American","pepperType":"Ghost Pepper","heatCategory":"Super Hot"},"sauce-crafters-mountain-man-fire-roasted-habanero":{"name":"Mountain Man Fire Roasted Habanero","brand":"Sauce Crafters","size":"5 oz.","category":"HOT SAUCE","foodStyle":"American","pepperType":"Habanero","heatCategory":"Very Hot"},"puckerbutt-puckerbutt-gator-sauce":{"name":"Puckerbutt Gator Sauce","brand":"Puckerbutt","size":"5 oz.","category":"HOT SAUCE","foodStyle":"American","pepperType":"Pepper X","heatCategory":"Inferno"},"rheds-deja-vu":{"name":"Deja Vu","brand":"Rhed's","size":"5 oz.","category":"HOT SAUCE","foodStyle":"Asian","pepperType":"Guajillo","heatCategory":"Medium"},"rheds-lemon-drop":{"name":"Lemon Drop","brand":"Rhed's","size":"5 oz.","category":"HOT SAUCE","foodStyle":"Fruit","pepperType":"Aji Lemon Drop","heatCategory":"Medium"},"rheds-original":{"name":"Rhed's Original","brand":"Rhed’s","size":"5 oz.","category":"HOT SAUCE","foodStyle":"Cajun","pepperType":"Jalapeño","heatCategory":"Medium"},"walker-son-slap-ya-mama-hot-sauce":{"name":"Slap Ya Mama Hot Sauce","brand":"Walker & Son","size":"5 oz.","category":"HOT SAUCE","foodStyle":"Cajun","pepperType":"Cayenne","heatCategory":"Medium"},"defcon-curbstomp":{"name":"Curbstomp","brand":"Defcon","size":"8 oz.","category":"WING SAUCE","foodStyle":"Buffalo","pepperType":"Reaper","heatCategory":"Extreme"},"defcon-cluckwing":{"name":"Cluckwing","brand":"Defcon","size":"8 oz.","category":"WING SAUCE","foodStyle":"Buffalo","pepperType":"Scorpion","heatCategory":"Super Hot"},"defcon-condition-2":{"name":"Defense Condition #2","brand":"Defcon","size":"8 oz.","category":"WING SAUCE","foodStyle":"Buffalo","pepperType":"Habanero","heatCategory":"Medium"},"defcon-condition-3":{"name":"Defense Condition #3","brand":"Defcon","size":"8 oz.","category":"WING SAUCE","foodStyle":"Buffalo","pepperType":"Cayenne","heatCategory":"Mild"},"sucklebusters-original-bbq":{"name":"Original BBQ","brand":"Sucklebusters","size":"12 oz.","category":"BBQ SAUCE","foodStyle":"BBQ","pepperType":"Spices","heatCategory":"Mild"},"sucklebusters-bbq-chipotle":{"name":"BBQ Chipotle","brand":"Sucklebusters","size":"12 oz.","category":"BBQ SAUCE","foodStyle":"BBQ","pepperType":"Chipotle","heatCategory":"Medium"},"sauce-crafters-colon-cleaner-mustard":{"name":"Colon Cleaner Mustard","brand":"Sauce Crafters","size":"5.7 oz.","category":"CONDIMENTS","foodStyle":"Condiment","pepperType":"Habanero","heatCategory":"Hot"},"melindas-chipotle-ketchup":{"name":"Chipotle Ketchup","brand":"Melinda's","size":"14 oz.","category":"CONDIMENTS","foodStyle":"Condiment","pepperType":"Chipotle","heatCategory":"Medium"},"melindas-naga-jolokia-ketchup":{"name":"Naga Jolokia Ketchup","brand":"Melinda's","size":"14 oz.","category":"CONDIMENTS","foodStyle":"Condiment","pepperType":"Ghost Pepper","heatCategory":"Super Hot"},"the-spicy-shark-habanero-maple-syrup":{"name":"Habanero Maple Syrup","brand":"The Spicy Shark","size":"8 oz.","category":"CONDIMENTS","foodStyle":"Condiment","pepperType":"Habanero","heatCategory":"Medium"},"mikey-vs-gator-toes-spicy":{"name":"Gator Toes - Spicy","brand":"Mikey V's","size":"3 oz.","category":"SNACKS","foodStyle":"Vegetable","pepperType":"Red Pepper","heatCategory":"Medium"},"mikey-vs-gator-toes-bbq":{"name":"Gator Toes - BBQ","brand":"Mikey V's","size":"3 oz.","category":"SNACKS","foodStyle":"Vegetable","pepperType":"none","heatCategory":""},"mikey-vs-gator-toes-buffalo":{"name":"Gator Toes - Buffalo","brand":"Mikey V's","size":"3 oz.","category":"SNACKS","foodStyle":"Vegetable","pepperType":"Paprika","heatCategory":"Medium"},"mikey-vs-gator-toes-dill-pickle":{"name":"Gator Toes - Dill Pickle","brand":"Mikey V's","size":"3 oz.","category":"SNACKS","foodStyle":"Vegetable","pepperType":"none","heatCategory":""},"mikey-vs-gator-toes-loco-spice":{"name":"Gator Toes - Loco Spice","brand":"Mikey V's","size":"3 oz.","category":"SNACKS","foodStyle":"Vegetable","pepperType":"Reaper","heatCategory":"Extreme"},"2-pig-mafia-steak-seasoning-14oz":{"name":"2 Pig Mafia Steak Seasoning 14oz","brand":"2 Pig Mafia","size":"13 oz.","category":"SEASONINGS/DRY RUBS","foodStyle":"BBQ","pepperType":"Chili Peppers","heatCategory":"Medium"},"sucklebusters-hogwaller-14oz":{"name":"Sucklebusters Hogwaller 14oz","brand":"Sucklebusters","size":"13.75 oz.","category":"SEASONINGS/DRY RUBS","foodStyle":"BBQ","pepperType":"Chili Peppers","heatCategory":"Mild"},"suckelbusters-1836-14oz":{"name":"Suckelbusters 1836 14oz","brand":"Suckelbusters","size":"12 oz.","category":"SEASONINGS/DRY RUBS","foodStyle":"BBQ","pepperType":"Spices","heatCategory":"Mild"},"sucklebusters-clucker-dust-14oz":{"name":"Sucklebusters Clucker Dust 14oz","brand":"Sucklebusters","size":"14.25 oz.","category":"SEASONINGS/DRY RUBS","foodStyle":"BBQ","pepperType":"Chipotle","heatCategory":"Medium"},"sucklebusters-bamm-14oz":{"name":"Sucklebusters Bamm 14oz","brand":"Sucklebusters","size":"14.25 oz.","category":"SEASONINGS/DRY RUBS","foodStyle":"BBQ","pepperType":"Habanero","heatCategory":"Hot"},"pepper-junction-all-purpose-spg-14oz":{"name":"All Purpose SPG 14oz","brand":"Pepper Junction","size":"12 oz.","category":"SEASONINGS/DRY RUBS","foodStyle":"BBQ","pepperType":"none","heatCategory":"Mild"},"walker-son-slap-ya-mama-cajun-original":{"name":"Slap Ya Mama Cajun Original","brand":"Walker & Son","size":"8 oz.","category":"SEASONINGS/DRY RUBS","foodStyle":"Cajun","pepperType":"Red Pepper","heatCategory":"Mild"},"walker-son-slap-ya-mama-cajun-hot":{"name":"Slap Ya Mama Cajun Hot","brand":"Walker & Son","size":"8 oz.","category":"SEASONINGS/DRY RUBS","foodStyle":"Cajun","pepperType":"Red Pepper","heatCategory":"Medium"},"walker-son-slap-ya-mama-cajun-low-sodium":{"name":"Slap Ya Mama Cajun Low Sodium","brand":"Walker & Son","size":"8 oz.","category":"SEASONINGS/DRY RUBS","foodStyle":"Cajun","pepperType":"Red Pepper","heatCategory":"Mild"},"ass-kickin-habanero-garlic-salt":{"name":"Habanero Garlic Salt","brand":"Ass Kickin","size":"4 oz.","category":"SEASONINGS/DRY RUBS","foodStyle":"Seasoning","pepperType":"Habanero","heatCategory":"Hot"},"ariston-chili-infused-olive-oil":{"name":"Chili Infused Olive Oil","brand":"Ariston","size":"8.45 oz.","category":"Olive Oil/Vinegar","foodStyle":"Mediterranean","pepperType":"Chili Peppers","heatCategory":"Medium"},"ariston-garlic-infused-olive-oil":{"name":"Garlic Infused Olive Oil","brand":"Ariston","size":"8.45 oz.","category":"Olive Oil/Vinegar","foodStyle":"Mediterranean","pepperType":"none","heatCategory":""},"ariston-tuscan-herb-infused-olive-oil":{"name":"Tuscan Herb Infused Olive Oil","brand":"Ariston","size":"8.45 oz.","category":"Olive Oil/Vinegar","foodStyle":"Mediterranean","pepperType":"none","heatCategory":""},"ariston-lemon-infused-olive-oil":{"name":"Lemon Infused Olive Oil","brand":"Ariston","size":"8.45 oz.","category":"Olive Oil/Vinegar","foodStyle":"Mediterranean","pepperType":"none","heatCategory":""},"ariston-fig-infused-balsamic-vinegar":{"name":"Fig Infused Balsamic Vinegar","brand":"Ariston","size":"8.45 oz.","category":"Olive Oil/Vinegar","foodStyle":"Mediterranean","pepperType":"none","heatCategory":""},"ariston-black-cherry-infused-balsamic-vinegar":{"name":"Black Cherry Infused Balsamic Vinegar","brand":"Ariston","size":"8.45 oz.","category":"Olive Oil/Vinegar","foodStyle":"Mediterranean","pepperType":"none","heatCategory":""}};


  /* ── LOCKED VOCABULARIES — sourced from CNS v7.1 ── */
  var HEAT_LADDER = ['Mild', 'Medium', 'Hot', 'Very Hot', 'Super Hot', 'Extreme', 'Inferno'];
  var HOW_IT_HITS = ['Delayed Escalation', "Hit'n Run", 'Plane Take-Off'];
  var HEAT_FINISH = ['Ends With Flavor', 'Plane Landing', 'Fire Pole Down', 'Stays for Coffee', 'Feel the Flame', 'Say Goodnight'];

  var VALID_STATES = ['ELIGIBLE', 'NOT_SIGNED_IN', 'NOT_PURCHASED', 'ALREADY_REVIEWED', 'SUBMITTED', 'ERROR'];

  function getParam(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
  }

  /* Mock session/state resolution. Live version: Supabase auth session. */
  function currentState() {
    var s = (getParam('state') || 'ELIGIBLE').toUpperCase();
    return VALID_STATES.indexOf(s) !== -1 ? s : 'ELIGIBLE';
  }

  var PJReviewData = {

    STATES: VALID_STATES,

    getState: currentState,

    /* Product identity — from the CNS. */
    getProduct: function (slug) {
      return CNS_PRODUCTS[slug] ? Object.assign({ slug: slug }, CNS_PRODUCTS[slug]) : null;
    },

    /* Q10 vocabulary — union of the CNS Food Style column (self-maintaining). */
    getFoodStyles: function () {
      var set = {};
      Object.keys(CNS_PRODUCTS).forEach(function (k) {
        var v = CNS_PRODUCTS[k].foodStyle;
        if (v) set[v] = true;
      });
      return Object.keys(set).sort();
    },

    /* Q7 options — official heat category ±1, with locked edge rules. */
    getHeatOptions: function (heatCategory) {
      var i = HEAT_LADDER.indexOf(heatCategory);
      if (i === -1) return [];
      if (heatCategory === 'Mild')    return ['Mild', 'Medium'];
      if (heatCategory === 'Inferno') return ['Extreme', 'Inferno'];
      return [HEAT_LADDER[i - 1], HEAT_LADDER[i], HEAT_LADDER[i + 1]];
    },

    /* Q11 options — the product's CNS Pepper Type field. */
    getPepperOptions: function (product) {
      if (!product || !product.pepperType) return [];
      return product.pepperType.split(/[,;]/).map(function (s) { return s.trim(); }).filter(Boolean);
    },

    getHowItHits: function () { return HOW_IT_HITS.slice(); },
    getHeatFinish: function () { return HEAT_FINISH.slice(); },

    /* ── CUSTOMER SESSION (mock) — live: Supabase auth ── */
    getSession: function () {
      if (currentState() === 'NOT_SIGNED_IN') return { signedIn: false };
      return { signedIn: true, firstName: 'Pepper', passengerClass: 'Day Coach Passenger' };
    },

    /* ── PRODUCT REVIEW ELIGIBILITY (mock) — live: Supabase
       product_review_eligibility, created from verified Square history ── */
    getEligibility: function (slug) {
      var state = currentState();
      return Promise.resolve({
        signedIn: state !== 'NOT_SIGNED_IN',
        eligible: state === 'ELIGIBLE' || state === 'SUBMITTED' || state === 'ERROR',
        alreadyReviewed: state === 'ALREADY_REVIEWED',
        reason: state === 'NOT_PURCHASED' ? 'NO_QUALIFYING_PURCHASE' : null
      });
    },

    /* ── REVIEW SUBMISSION (mock) — live: protected Supabase function.
       Field-level payload by design: each answer is its own field so
       non-scoring answers can be made editable later without migration.
       The UI submits raw answers only — the backend owns all scoring,
       moderation, aggregates, and badge progress. ── */
    submitReview: function (payload) {
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          if (currentState() === 'ERROR') {
            reject({ ok: false, error: 'MOCK_SUBMIT_FAILURE' });
          } else {
            resolve({ ok: true, reviewId: 'mock-' + Date.now(), moderationStatus: 'PENDING' });
          }
        }, 900);
      });
    },

    /* ── PERSONAL RATING (mock: localStorage) — live: its own Supabase
       table, per customer per product, editable any time, never public,
       never part of any aggregate. Available to any signed-in customer. ── */
    getPersonalRating: function (slug) {
      try {
        var v = window.localStorage.getItem('pj-personal-rating:' + slug);
        return v === null ? null : parseFloat(v);
      } catch (e) { return null; }
    },
    savePersonalRating: function (slug, value) {
      try {
        window.localStorage.setItem('pj-personal-rating:' + slug, String(value));
        return true;
      } catch (e) { return false; }
    },

    /* ── DEV STATE SWITCHER (build phase only — remove before launch) ── */
    mountStateSwitcher: function () {
      var wrap = document.createElement('div');
      wrap.className = 'pjr-dev-switch';
      wrap.innerHTML = '<span class="pjr-dev-label">Dev · State</span>';
      var cur = currentState();
      VALID_STATES.forEach(function (s) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = s.replace(/_/g, ' ');
        if (s === cur) b.className = 'is-active';
        b.addEventListener('click', function () {
          var slug = getParam('product') || '';
          window.location.search = '?product=' + encodeURIComponent(slug) + '&state=' + s;
        });
        wrap.appendChild(b);
      });
      document.body.appendChild(wrap);
    }
  };

  window.PJReviewData = PJReviewData;
})();
