/**
 * pj-product.js
 * Pepper Junction — Product Page Intelligence Layer
 *
 * Handles:
 *   1. Session management   — tracks browsing history across product pages
 *   2. Customer portrait    — builds flavor/heat profile from session history
 *   3. Scoring engine       — ported from Pairing Bar widget (index.html)
 *   4. loadSimilar          — scores full JSON catalog, renders 4 recommendation cards
 *
 * Dependencies (must exist on the product page before this script runs):
 *   PAGE_SLUG  — hardcoded string, the only value unique per page
 *   DB_PATH    — path to Database_Pepper_Junction.json
 *
 * Usage (added to every product page by the generator):
 *   <script src="../assets/js/pj-product.js"></script>
 */

(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════════
     1. SESSION MANAGEMENT
     Writes current page to session history on load.
     Reads full history to build customer portrait.
     No expiration — dies naturally when browser tab closes.
  ══════════════════════════════════════════════════════════════ */

  var SESSION_KEY = 'pj_session_pages';

  function sessionRead() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function sessionWrite(slug) {
    try {
      var pages = sessionRead();
      /* Add current slug if not already the most recent entry */
      if (pages[pages.length - 1] !== slug) {
        pages.push(slug);
      }
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(pages));
    } catch (e) {
      /* sessionStorage unavailable — silent fail, scoring falls back to product fields */
    }
  }

  /**
   * buildPortrait
   * Reads session history slugs, pulls full product data for each from the
   * JSON catalog, and aggregates a customer flavor/heat portrait.
   *
   * Returns an object:
   * {
   *   flavorTerms  : Set of flavor token strings seen across visited pages
   *   foodStyles   : Set of food style strings seen
   *   pepperTypes  : Set of pepper type strings seen
   *   pairings     : Set of pairing keyword strings seen
   *   heatLevels   : Array of numeric heat levels seen
   *   avgHeat      : average heat level across visited products (excluding 0)
   *   maxHeat      : highest heat level seen
   * }
   */
  function buildPortrait(history, catalog, currentSlug) {
    var portrait = {
      flavorTerms : [],
      foodStyles  : [],
      pepperTypes : [],
      pairings    : [],
      heatLevels  : [],
      avgHeat     : 0,
      maxHeat     : 0
    };

    /* Only use history entries that aren't the current page */
    var relevant = history.filter(function(s){ return s !== currentSlug; });
    if (!relevant.length) return portrait;

    relevant.forEach(function(slug) {
      var p = catalog.find(function(x){ return x.slug === slug; });
      if (!p) return;

      /* Flavor tokens */
      flavorTokens(p['Primary Flavor Notes'] || '').forEach(function(t){
        if (portrait.flavorTerms.indexOf(t) === -1) portrait.flavorTerms.push(t);
      });

      /* Food style */
      var fs = (p['Food Style'] || '').trim();
      if (fs && portrait.foodStyles.indexOf(fs) === -1) portrait.foodStyles.push(fs);

      /* Pepper type */
      var pt = (p['Pepper Type'] || '').trim();
      if (pt && pt !== 'none' && portrait.pepperTypes.indexOf(pt) === -1) portrait.pepperTypes.push(pt);

      /* Pairing keywords */
      (p['Best Food Pairings'] || '').split(',').forEach(function(pair){
        var trimmed = pair.trim().toLowerCase();
        if (trimmed && portrait.pairings.indexOf(trimmed) === -1) portrait.pairings.push(trimmed);
      });

      /* Heat */
      var level = Number(p['Heat Level'] || 0);
      if (level > 0) {
        portrait.heatLevels.push(level);
        if (level > portrait.maxHeat) portrait.maxHeat = level;
      }
    });

    /* Average heat */
    if (portrait.heatLevels.length) {
      var sum = portrait.heatLevels.reduce(function(a, b){ return a + b; }, 0);
      portrait.avgHeat = sum / portrait.heatLevels.length;
    }

    return portrait;
  }

  /* ══════════════════════════════════════════════════════════════
     2. HEAT WINDOW RULE
     Equal or lower heat: always allowed.
     Up to +1 heat level above current: allowed.
     More than +1 above: excluded.
     Graduated descent: ±2 preferred, deeper only if justified by score.
     Zero-heat products (Level 0): heat rule does not apply — score on
     flavor and pairing only.
  ══════════════════════════════════════════════════════════════ */

  var HEAT_ORDER = ['Mild', 'Medium', 'Hot', 'Very Hot', 'Super Hot', 'Extreme', 'Inferno'];

  function heatIndex(category) {
    var idx = HEAT_ORDER.indexOf(category || '');
    return idx === -1 ? 0 : idx;
  }

  /**
   * isHeatAllowed
   * Graduated heat window — real world hot sauce knowledge applied:
   * Levels 1-4 (mild-medium habanero territory): allow up to +3 above
   * Levels 5-6 (getting serious): allow up to +2 above
   * Levels 7+ (superhot territory): allow up to +1 above
   * Zero-heat products always pass.
   */
  function isHeatAllowed(currentLevel, candidateLevel, candidateCategory) {
    /* Zero-heat products always pass — evaluated on flavor/pairing only */
    if (!candidateLevel || candidateLevel === 0) return true;
    if (!currentLevel  || currentLevel  === 0) return true;

    var maxJump;
    if (currentLevel <= 4)      maxJump = 3;
    else if (currentLevel <= 6) maxJump = 2;
    else                        maxJump = 1;

    return candidateLevel <= currentLevel + maxJump;
  }

  /**
   * heatProximityBonus
   * Rewards candidates within the preferred ±2 window.
   * Penalizes candidates that are far below current heat (cliff descent).
   * Used as a scoring modifier, not a hard filter.
   */
  function heatProximityBonus(currentLevel, candidateLevel) {
    if (!candidateLevel || candidateLevel === 0) return 0;
    var diff = Math.abs(candidateLevel - currentLevel);
    if (diff === 0) return 2;
    if (diff === 1) return 1;
    if (diff === 2) return 0;
    /* Far outside preferred window — small penalty to avoid cliff drops */
    return -1;
  }

  /* ══════════════════════════════════════════════════════════════
     3. SCORING ENGINE
     Ported directly from Pairing Bar widget (index.html).
     hasWholeWord, hasWholePhrase, normalizeText, recordFields,
     matchesSearch, getRelevanceScore — same logic, same weights.
     No UI dependency. Operates on complete strings from structured data.
  ══════════════════════════════════════════════════════════════ */

  var LOCKED_PHRASES = [
    'mac and cheese', 'steak and cheese', 'breakfast burritos',
    'breakfast sandwiches', 'buffalo chicken', 'buffalo dip',
    'fish sandwich', 'roast beef sandwich', 'clam cakes', 'fried clams',
    'chicken and waffles', 'prime rib', 'home fries', 'egg salad',
    'chicken salad', 'tuna salad', 'potato salad', 'pasta salad',
    'lobster salad', 'beef roasts', 'mashed potatoes', 'italian grinder',
    'italian grinders', 'cold cuts', 'seafood salad', 'breakfast burrito',
    'breakfast sandwich'
  ];

  var PROTECTED_WORDS = ['brie'];

  var FLAVOR_STOPWORDS = ['and', 'the', 'a', 'with', 'of', 'pepper', 'hot'];

  function flavorTokens(str) {
    return (str || '').toLowerCase()
      .replace(/[-\/]/g, ' ')
      .split(/[\s,]+/)
      .map(function(t){ return t.trim(); })
      .filter(function(t){
        return t.length > 1 && FLAVOR_STOPWORDS.indexOf(t) === -1;
      });
  }

  function normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function getQueryVariants(term) {
    var t = normalizeText(term);
    if (!t) return [];
    var variants = [t];
    if (t.length > 3) {
      if (t.endsWith('s')) {
        variants.push(t.slice(0, -1));
      } else {
        variants.push(t + 's');
      }
    }
    return variants;
  }

  function hasWholeWord(text, term) {
    var normalized = normalizeText(text);
    if (!normalized) return false;
    return getQueryVariants(term).some(function(variant) {
      var pattern = new RegExp(
        '(^|[^a-z0-9])' + escapeRegExp(variant) + '($|[^a-z0-9])', 'i'
      );
      return pattern.test(normalized);
    });
  }

  function hasWholePhrase(text, phrase) {
    var normalized = normalizeText(text);
    var target = normalizeText(phrase);
    if (!normalized || !target) return false;
    var pattern = new RegExp(
      '(^|[^a-z0-9])' + escapeRegExp(target) + '($|[^a-z0-9])', 'i'
    );
    return pattern.test(normalized);
  }

  function isLockedPhrase(query) {
    var q = normalizeText(query);
    return LOCKED_PHRASES.some(function(phrase){
      return normalizeText(phrase) === q;
    });
  }

  function isProtectedWord(query) {
    var q = normalizeText(query);
    return PROTECTED_WORDS.some(function(word){
      return normalizeText(word) === q;
    });
  }

  function recordFields(record) {
    return {
      brand       : record['Brand']                || '',
      productName : record['Product Name']         || '',
      category    : record['Category']             || '',
      foodStyle   : record['Food Style']           || '',
      pepperType  : record['Pepper Type']          || '',
      heatCategory: record['Heat Category']        || '',
      heatCurve   : record['How it Hits']          || '',
      heatFinish  : record['Heat Finish']          || '',
      flavorNotes : record['Primary Flavor Notes'] || '',
      pairings    : record['Best Food Pairings']   || ''
    };
  }

  function matchesSearch(record, query) {
    var q = normalizeText(query);
    if (!q) return true;

    var fields = recordFields(record);
    var allFields = [
      fields.productName, fields.pairings, fields.flavorNotes,
      fields.foodStyle, fields.brand, fields.category, fields.pepperType,
      fields.heatCategory, fields.heatCurve, fields.heatFinish
    ];

    if (isLockedPhrase(q)) {
      return allFields.some(function(text){
        return hasWholePhrase(text, q);
      });
    }

    if (isProtectedWord(q)) {
      return allFields.some(function(text){
        return hasWholeWord(text, q);
      });
    }

    var parts = q.split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      /* ANY term match qualifies — not ALL terms required */
      return parts.some(function(part){
        return allFields.some(function(text){
          return normalizeText(text).includes(part);
        });
      });
    }

    return allFields.some(function(text){
      return normalizeText(text).includes(q);
    });
  }

  function getRelevanceScore(record, query) {
    var score = 0;
    var q = normalizeText(query);
    if (!q) return score;

    var fields = recordFields(record);

    if (isLockedPhrase(q)) {
      if (hasWholePhrase(fields.productName, q)) score += 30;
      if (hasWholePhrase(fields.pairings,     q)) score += 40;
      if (hasWholePhrase(fields.flavorNotes,  q)) score += 18;
      if (hasWholePhrase(fields.foodStyle,    q)) score += 16;
      if (hasWholePhrase(fields.brand,        q)) score += 8;
      if (hasWholePhrase(fields.category,     q)) score += 6;
      return score;
    }

    if (isProtectedWord(q)) {
      if (hasWholeWord(fields.productName, q)) score += 22;
      if (hasWholeWord(fields.pairings,    q)) score += 28;
      if (hasWholeWord(fields.flavorNotes, q)) score += 14;
      if (hasWholeWord(fields.foodStyle,   q)) score += 12;
      if (hasWholeWord(fields.brand,       q)) score += 6;
      if (hasWholeWord(fields.category,    q)) score += 4;
      return score;
    }

    var parts = q.split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      parts.forEach(function(part) {
        if (hasWholeWord(fields.productName, part)) score += 10;
        if (hasWholeWord(fields.pairings,    part)) score += 12;
        if (hasWholeWord(fields.flavorNotes, part)) score += 8;
        if (hasWholeWord(fields.foodStyle,   part)) score += 10;
        if (hasWholeWord(fields.pepperType,  part)) score += 4;
        if (hasWholeWord(fields.brand,       part)) score += 3;
        if (hasWholeWord(fields.category,    part)) score += 2;
      });
      return score;
    }

    if (hasWholeWord(fields.productName, q)) score += 12;
    if (hasWholeWord(fields.pairings,    q)) score += 15;
    if (hasWholeWord(fields.foodStyle,   q)) score += 14;
    if (hasWholeWord(fields.flavorNotes, q)) score += 8;
    if (hasWholeWord(fields.pepperType,  q)) score += 5;
    if (hasWholeWord(fields.category,    q)) score += 4;

    return score;
  }

  /* ══════════════════════════════════════════════════════════════
     4. COMPOSITE QUERY BUILDER
     Synthesizes a query string from:
       a) Current product's own fields (primary signal)
       b) Session portrait — browsing history (supporting signal)
       c) Widget search session data if present (bonus signal)
     Returns a space-separated string of meaningful terms.
  ══════════════════════════════════════════════════════════════ */

  function buildCompositeQuery(product, portrait) {
    var terms = [];

    /* Current product — primary signal, weighted by inclusion order */
    flavorTokens(product['Primary Flavor Notes'] || '').forEach(function(t){
      if (terms.indexOf(t) === -1) terms.push(t);
    });

    var fs = (product['Food Style'] || '').trim();
    if (fs && terms.indexOf(fs.toLowerCase()) === -1) terms.push(fs.toLowerCase());

    var pt = (product['Pepper Type'] || '').trim();
    if (pt && pt !== 'none' && terms.indexOf(pt.toLowerCase()) === -1) {
      terms.push(pt.toLowerCase());
    }

    /* Session portrait — supporting signal */
    /* Add flavor terms from browsing history not already in query */
    portrait.flavorTerms.forEach(function(t){
      if (terms.indexOf(t) === -1) terms.push(t);
    });

    /* Add food styles from history */
    portrait.foodStyles.forEach(function(s){
      var lower = s.toLowerCase();
      if (terms.indexOf(lower) === -1) terms.push(lower);
    });

    /* Widget session bonus — if customer used the Pairing Bar */
    try {
      var widgetQuery = sessionStorage.getItem('pj_search_query');
      var widgetStyle = sessionStorage.getItem('pj_food_style');
      var widgetHeat  = sessionStorage.getItem('pj_heat_pref');

      if (widgetQuery) {
        widgetQuery.trim().toLowerCase().split(/\s+/).forEach(function(t){
          if (t.length > 1 && terms.indexOf(t) === -1) terms.push(t);
        });
      }
      if (widgetStyle && terms.indexOf(widgetStyle.toLowerCase()) === -1) {
        terms.push(widgetStyle.toLowerCase());
      }
      if (widgetHeat && terms.indexOf(widgetHeat.toLowerCase()) === -1) {
        terms.push(widgetHeat.toLowerCase());
      }
    } catch(e) {
      /* sessionStorage unavailable — skip widget signal */
    }

    return terms.join(' ');
  }

  /* ══════════════════════════════════════════════════════════════
     5. loadSimilar
     Main entry point called by product page after JSON fetch.
     Scores full catalog against composite query + heat rules.
     Renders 4 recommendation cards.
  ══════════════════════════════════════════════════════════════ */

  function loadSimilar(data, product, currentSlug) {
    var grid = document.getElementById('similar-products');
    if (!grid) return;

    var currentLevel    = Number(product['Heat Level'] || 0);
    var currentStyle    = (product['Food Style'] || '').toLowerCase().trim();

    /* Category helpers */
    var SAUCE_CATS    = ['hot sauce', 'wing sauce'];
    var NONSAUCE_CATS = ['seasonings/dry rubs', 'snacks', 'condiments', 'olive oil/vinegar'];

    function isSauce(p) {
      return SAUCE_CATS.indexOf((p['Category'] || '').toLowerCase().trim()) !== -1;
    }

    function isNonSauce(p) {
      return NONSAUCE_CATS.indexOf((p['Category'] || '').toLowerCase().trim()) !== -1;
    }

    /* Build session portrait */
    var history = sessionRead();
    var portrait = buildPortrait(history, data, currentSlug);

    /* Build composite query */
    var query = buildCompositeQuery(product, portrait);

    /* Score all candidates except current product */
    var candidates = data.filter(function(p){ return p.slug !== currentSlug; });

    var scored = candidates.map(function(p) {
      var candidateLevel = Number(p['Heat Level'] || 0);

      /* Hard exclude anything more than 1 heat level above current */
      if (!isHeatAllowed(currentLevel, candidateLevel, p['Heat Category'])) {
        return null;
      }

      var fields = recordFields(p);

      /* Flavor floor — score from flavor-relevant fields.
         Sauces must earn at least 1 point here to qualify for slots 1-3.
         Pepper type and heat alone are not enough. */
      var flavorScore = 0;
      var queryParts  = query.split(/\s+/).filter(Boolean);
      queryParts.forEach(function(part) {
        if (hasWholeWord(fields.flavorNotes, part)) flavorScore += 8;
        if (hasWholeWord(fields.foodStyle,   part)) flavorScore += 10;
        if (hasWholeWord(fields.pairings,    part)) flavorScore += 12;
      });
      /* Food style exact match bonus counts toward flavor floor */
      if (fields.foodStyle.toLowerCase().trim() === currentStyle) flavorScore += 14;

      /* Base relevance score from widget engine */
      var score = matchesSearch(p, query) ? getRelevanceScore(p, query) : 0;

      /* Heat proximity bonus — tiebreaker only */
      score += heatProximityBonus(currentLevel, candidateLevel);

      /* Food style match bonus — weighted to outrank pure heat proximity */
      if (fields.foodStyle.toLowerCase().trim() === currentStyle) {
        score += 14;
      }

      return { p: p, score: score, flavorScore: flavorScore };
    }).filter(Boolean);

    /* Sort by score descending */
    scored.sort(function(a, b){ return b.score - a.score; });

    /* Separate sauces from scored pool — slots 1-3
       Sauce must have flavorScore > 0 to qualify.
       Fallback handles any empty slots if flavor pool runs dry. */
    var scoredSauces = scored.filter(function(o){
      return isSauce(o.p) && o.flavorScore > 0;
    });

    /* Track used slugs — no duplicates across all 4 slots */
    var used = [currentSlug];
    function notUsed(p){ return used.indexOf(p.slug) === -1; }

    function pickSauce() {
      var candidate = scoredSauces.find(function(o){ return notUsed(o.p); });
      return candidate ? candidate.p : null;
    }

    /* Fallback — nearest sauce by food style + heat when scored pool exhausted */
    function fallbackSauce() {
      var pool = candidates.filter(function(p){
        return isSauce(p) && notUsed(p) &&
               isHeatAllowed(currentLevel, Number(p['Heat Level']||0), p['Heat Category']);
      });
      pool.sort(function(a, b){
        var aStyle = (a['Food Style']||'').toLowerCase().trim() === currentStyle ? 0 : 1;
        var bStyle = (b['Food Style']||'').toLowerCase().trim() === currentStyle ? 0 : 1;
        if (aStyle !== bStyle) return aStyle - bStyle;
        return Math.abs(Number(a['Heat Level']||0) - currentLevel) -
               Math.abs(Number(b['Heat Level']||0) - currentLevel);
      });
      return pool.length ? pool[0] : null;
    }

    /* ── Slot 4 — Snacks only, randomized, heat window applies ── */
    function pickSnack() {
      var pool = candidates.filter(function(p){
        return (p['Category'] || '').toLowerCase().trim() === 'snacks' &&
               notUsed(p) &&
               isHeatAllowed(currentLevel, Number(p['Heat Level']||0), p['Heat Category']);
      });
      if (!pool.length) return null;
      /* Random pick from eligible snacks */
      return pool[Math.floor(Math.random() * pool.length)];
    }

    /* ── Pick slots ── */
    var slot1 = pickSauce()  || fallbackSauce();
    if (slot1) used.push(slot1.slug);

    var slot2 = pickSauce()  || fallbackSauce();
    if (slot2) used.push(slot2.slug);

    var slot3 = pickSauce()  || fallbackSauce();
    if (slot3) used.push(slot3.slug);

    var slot4 = pickSnack();
    if (slot4) used.push(slot4.slug);

    /* ── Render ── */
    var slots  = [slot1, slot2, slot3, slot4].filter(Boolean);
    var labels = ['Flavor Match', 'Same Style', 'You Might Like', 'Try With It'];

    if (!slots.length) {
      grid.innerHTML = '<div class="similar-loading">No similar products found.</div>';
      return;
    }

    function esc(s) {
      return String(s||'')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    grid.innerHTML = slots.map(function(p, i) {
      var img  = '../assets/sauces/' + (p.slug || '') + '.png';
      var heat = p['Heat Category'] || '';
      return '<a class="similar-card" href="' + esc(p.slug) + '.html">' +
        '<div class="similar-label">'  + esc(labels[i] || '') + '</div>' +
        '<img class="similar-img" src="' + esc(img) + '" alt="' + esc(p['Product Name']) + '" ' +
        'loading="lazy" onerror="this.src=\'../assets/PJ-logo.png\'">' +
        '<div class="similar-brand">'  + esc(p['Brand']        || '') + '</div>' +
        '<div class="similar-name">'   + esc(p['Product Name'] || '') + '</div>' +
        '<div class="similar-heat">'   + esc(heat)                    + '</div>' +
        '</a>';
    }).join('');
  }

  /* ══════════════════════════════════════════════════════════════
     6. WIDGET SESSION WRITER
     Called by index.html when a customer clicks through to a product
     page from the Pairing Bar. Writes search state to sessionStorage
     so the product page scoring engine can use it as bonus signal.
     Add this call to the product card click handler in index.html.
  ══════════════════════════════════════════════════════════════

  PJProduct.writeWidgetSession = function(query, filters) {
    try {
      if (query)              sessionStorage.setItem('pj_search_query', query);
      if (filters.heatPref)   sessionStorage.setItem('pj_heat_pref',    filters.heatPref);
      if (filters.foodStyle)  sessionStorage.setItem('pj_food_style',   filters.foodStyle);
      if (filters.pepperType) sessionStorage.setItem('pj_pepper_type',  filters.pepperType);
      if (filters.heatCurve)  sessionStorage.setItem('pj_how_it_hits',  filters.heatCurve);
      if (filters.heatFinish) sessionStorage.setItem('pj_heat_finish',  filters.heatFinish);
      if (filters.category)   sessionStorage.setItem('pj_category',     filters.category);
    } catch(e) {}
  };

  ══════════════════════════════════════════════════════════════ */

  /* ══════════════════════════════════════════════════════════════
     7. BADGE SYSTEM
     All badge logic lives here. HTML needs only one empty container:
       <div class="product-badges" id="product-badges"></div>
     Add new tiers, rename badges, add food keywords — one file only.
  ══════════════════════════════════════════════════════════════ */

  /* ── Badge Car description — edit here, all 62 pages update ── */
  var BADGE_CAR_DESCRIPTION = 'Every sauce you buy earns you something. '
    + '<span style="color:var(--brass-bright);">Heat badges:</span> track how far up the scale you\'ve gone. '
    + '<span style="color:var(--brass-bright);">Food badges:</span> mark your flavor territory. '
    + '<span style="color:var(--brass-bright);">Narrative badges:</span> connect you to the Pepper Junction story. '
    + 'Your Badge Depot, your personal display case of accomplishments and map of how to discover more. '
    + '<span style="color:var(--brass-bright);">But note: Some badges you\'ll see coming. Some will surprise you.</span>';

  /* ── Heat badge maps — L1, L2, L3 ── */
  var HEAT_BADGE_SLUGS = {
    'Mild':      'badge-mild',
    'Medium':    'badge-medium',
    'Hot':       'badge-hot',
    'Very Hot':  'badge-very-hot',
    'Super Hot': 'badge-super-hot',
    'Extreme':   'badge-extreme',
    'Inferno':   'badge-inferno'
  };

  var HEAT_BADGE_L1_NAMES = {
    'Mild':      "Keep the Milk for Cookies",
    'Medium':    "Farmer's Market Heat",
    'Hot':       "Sauce Boss",
    'Very Hot':  "Pucker Up, Pepper Head",
    'Super Hot': "Have Anything Hotter?",
    'Extreme':   "Pass the $%&@#! Carton!",
    'Inferno':   "Incinerator"
  };

  var HEAT_BADGE_L2_NAMES = {
    'Mild':      'Fever',
    'Medium':    'Cruel Summer',
    'Hot':       'I Like it Hot, Hot, Hot',
    'Very Hot':  'Hot Blooded',
    'Super Hot': 'Highway to the Danger Zone',
    'Extreme':   'Ring of Fire',
    'Inferno':   'Burning Down the House'
  };

  var HEAT_BADGE_L3_NAMES = {
    'Mild':      'Ferris Wheel',
    'Medium':    'The Sky Line',
    'Hot':       'The Flume',
    'Very Hot':  'Tilt-A-Whirl',
    'Super Hot': 'The Yo Yo',
    'Extreme':   'Free Fall',
    'Inferno':   'The Corkscrew'
  };

  /* ── Food badge map — keyword → badge file + display name ── */
  var FOOD_BADGE_MAP = [
    { keyword: 'caribbean', slug: 'badge-food-caribbean', name: 'Is This Love'        },
    { keyword: 'taco',      slug: 'badge-food-taco',      name: 'Taco Fever'          },
    { keyword: 'seafood',   slug: 'badge-food-seafood',   name: 'Shore Dinner Hall'   },
    { keyword: 'wings',     slug: 'badge-food-wings',     name: 'Epic Wingman'        },
    { keyword: 'sushi',     slug: 'badge-food-asian',     name: 'Asian'               },
    { keyword: 'mexican',   slug: 'badge-food-mexican',   name: 'Muy Rico!'           },
    { keyword: 'garlic',    slug: 'badge-food-garlic',    name: 'Garlic Breath'       },
    { keyword: 'bbq',       slug: 'badge-food-bbq',       name: 'Smoking Section'     },
    { keyword: 'breakfast', slug: 'badge-food-breakfast', name: 'This Is Your Brain'  },
    { keyword: 'veggies',   slug: 'badge-food-veggies',   name: 'Veggie Outlaws'      },
    { keyword: 'snack',     slug: 'badge-food-snacks',    name: 'Snack Shack'         },
    { keyword: 'italian',   slug: 'badge-food-italian',   name: 'Sunday Gravy'        },
    { keyword: 'cajun',     slug: 'badge-food-cajun',     name: 'Bayou Country'       },
    { keyword: 'indian',    slug: 'badge-food-indian',    name: 'Curry Favor'         },
    { keyword: 'asian',     slug: 'badge-food-asian',     name: 'Asian'               }
  ];

  /* ── Earn requirement map ── */
  var HEAT_EARN = {
    L1: '5 purchases in this heat category',
    L2: '10 purchases in this heat category',
    L3: '15 purchases in this heat category'
  };
  var FOOD_EARN      = '1 qualifying purchase matching this flavor territory';
  var RAILROAD_EARN  = 'Keep purchasing to find out where this journey takes you.';
  var NARRATIVE_EARN = 'Purchase Mediterranean products to begin uncovering the Olive Oil & Vin story';

  /* ── Tooltip card ── */
  function buildTooltipCard() {
    if (document.getElementById('badge-tooltip-card')) return;
    var card = document.createElement('div');
    card.id = 'badge-tooltip-card';
    card.innerHTML =
      '<div class="btc-close" id="btc-close">&#xd7;</div>' +
      '<div class="btc-img-wrap">' +
        '<img class="btc-img" id="btc-img" src="" alt="" ' +
          'onerror="this.style.display=\'none\';document.getElementById(\'btc-placeholder\').style.display=\'flex\'">' +
        '<div class="btc-placeholder" id="btc-placeholder" style="display:none;"></div>' +
      '</div>' +
      '<div class="btc-name" id="btc-name"></div>' +
      '<div class="btc-earn" id="btc-earn"></div>' +
      '<div class="btc-cta"><a href="https://pepperjunction401-beep.github.io/sauce-bar/join.html">Join Scovl&#8482; to start earning</a></div>';
    document.body.appendChild(card);
    document.getElementById('btc-close').addEventListener('click', closeTooltip);
    document.addEventListener('click', function(e) {
      var c = document.getElementById('badge-tooltip-card');
      if (c && c.classList.contains('open') && !c.contains(e.target) && !e.target.closest('.badge-item')) {
        closeTooltip();
      }
    });
  }

  function openTooltip(imgSrc, name, earn, isRailroad) {
    var card = document.getElementById('badge-tooltip-card');
    var img  = document.getElementById('btc-img');
    var ph   = document.getElementById('btc-placeholder');
    var nEl  = document.getElementById('btc-name');
    var eEl  = document.getElementById('btc-earn');
    if (!card) return;
    img.style.display = '';
    ph.style.display  = 'none';
    img.src = imgSrc;
    img.alt = name;
    nEl.textContent = name;
    eEl.textContent = isRailroad ? RAILROAD_EARN : earn;
    eEl.style.fontStyle = isRailroad ? 'italic' : '';
    card.classList.add('open');
  }

  function closeTooltip() {
    var card = document.getElementById('badge-tooltip-card');
    if (card) card.classList.remove('open');
  }

  function escBadge(s) {
    return String(s||'')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function badgeItem(imgSrc, name, earn, isRailroad) {
    return '<div class="badge-item" ' +
      'data-img="'      + escBadge(imgSrc) + '" ' +
      'data-name="'     + escBadge(name)   + '" ' +
      'data-earn="'     + escBadge(earn)   + '" ' +
      'data-railroad="' + (isRailroad ? 'true' : 'false') + '">' +
      '<img class="badge-img" src="' + escBadge(imgSrc) + '" ' +
      'alt="' + escBadge(name) + '" loading="lazy" ' +
      'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
      '<div class="badge-placeholder-small" style="display:none;"></div>' +
      '<div class="badge-name">' + escBadge(name) + '</div>' +
      '</div>';
  }

  function initBadges(params) {
    var heatCategory    = params.heatCategory    || '';
    var bestPairings    = (params.bestPairings   || '').toLowerCase();
    var foodStyle       = (params.foodStyle      || '').toLowerCase();
    var narrativeSeries = params.narrativeSeries || '';

    var container = document.getElementById('product-badges');
    if (!container) return;

    var html = '';

    /* ── L1 Heat badge ── */
    var l1Slug = HEAT_BADGE_SLUGS[heatCategory] || '';
    var l1Name = HEAT_BADGE_L1_NAMES[heatCategory] || '';
    if (l1Slug) {
      html += badgeItem('../assets/badges/heat/' + l1Slug + '.png', l1Name, HEAT_EARN.L1, false);
    }

    /* ── L2 Heat badge ── */
    var l2Slug = l1Slug ? 'L2-' + l1Slug : '';
    var l2Name = HEAT_BADGE_L2_NAMES[heatCategory] || '';
    if (l2Slug) {
      html += badgeItem('../assets/badges/heat/' + l2Slug + '.png', l2Name, HEAT_EARN.L2, false);
    }

    /* ── L3 Heat badge ── */
    var l3Slug = l1Slug ? 'L3-' + l1Slug : '';
    var l3Name = HEAT_BADGE_L3_NAMES[heatCategory] || '';
    if (l3Slug) {
      html += badgeItem('../assets/badges/heat/' + l3Slug + '.png', l3Name, HEAT_EARN.L3, false);
    }

    /* ── Food badges — up to 3, no duplicates ── */
    var addedFoodSlugs = [];
    FOOD_BADGE_MAP.forEach(function(b) {
      if (addedFoodSlugs.length >= 3) return;
      if (bestPairings.includes(b.keyword) || foodStyle.includes(b.keyword)) {
        if (addedFoodSlugs.indexOf(b.slug) === -1) {
          addedFoodSlugs.push(b.slug);
          html += badgeItem('../assets/badges/food/' + b.slug + '.png', b.name, FOOD_EARN, false);
        }
      }
    });

    /* ── Narrative badge ── */
    if (narrativeSeries) {
      html += badgeItem(
        '../assets/badges/food/badge-food-mediterranean.png',
        narrativeSeries, NARRATIVE_EARN, false
      );
    }

    container.innerHTML = html;

    /* ── Wire tooltip clicks ── */
    buildTooltipCard();
    container.querySelectorAll('.badge-item').forEach(function(item) {
      item.addEventListener('click', function() {
        openTooltip(
          item.getAttribute('data-img'),
          item.getAttribute('data-name'),
          item.getAttribute('data-earn'),
          item.getAttribute('data-railroad') === 'true'
        );
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════
     8. PUBLIC INTERFACE
     Exposed as window.PJProduct so product pages can call it
     after their JSON fetch completes.
  ══════════════════════════════════════════════════════════════ */

  window.PJProduct = {

    BADGE_CAR_DESCRIPTION: BADGE_CAR_DESCRIPTION,

    /**
     * init
     * Called by every product page immediately on load.
     * Writes current slug to session history.
     *
     * Usage in product page script:
     *   PJProduct.init(PAGE_SLUG);
     */
    init: function(slug) {
      sessionWrite(slug);
    },

    /**
     * initBadges
     * Called by product page after JSON fetch resolves.
     * Builds and injects the full badge station from product data.
     *
     * Usage in product page script:
     *   PJProduct.initBadges({
     *     heatCategory:    product['Heat Category'],
     *     bestPairings:    product['Best Food Pairings'],
     *     foodStyle:       product['Food Style'],
     *     narrativeSeries: product['narrative_series']
     *   });
     */
    initBadges: function(params) {
      initBadges(params);
    },

    /**
     * loadSimilar
     * Called by product page after JSON fetch resolves.
     * Renders the 4-slot recommendation rail.
     *
     * Usage in product page script:
     *   PJProduct.loadSimilar(data, product, PAGE_SLUG);
     */
    loadSimilar: function(data, product, slug) {
      loadSimilar(data, product, slug);
    }

  };

})();
