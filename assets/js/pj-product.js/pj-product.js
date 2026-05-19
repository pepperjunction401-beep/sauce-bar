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
 *   DB_PATH    — path to Database_Pepper_Junction_v4_1.json
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
   * Returns true if candidate product is within the allowed heat window
   * relative to the current product.
   */
  function isHeatAllowed(currentLevel, candidateLevel, candidateCategory) {
    /* Zero-heat products always pass — evaluated on flavor/pairing only */
    if (!candidateLevel || candidateLevel === 0) return true;
    if (!currentLevel  || currentLevel  === 0) return true;

    /* Allow equal, lower, or up to 1 numeric level higher */
    return candidateLevel <= currentLevel + 1;
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
    if (diff === 0) return 6;
    if (diff === 1) return 4;
    if (diff === 2) return 2;
    if (diff === 3) return 0;
    /* Far below current heat — small penalty to avoid cliff drops */
    return -2;
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
    var priorityFields  = [
      fields.productName, fields.pairings, fields.flavorNotes,
      fields.foodStyle, fields.brand, fields.category, fields.pepperType
    ];
    var secondaryFields = [fields.heatCategory, fields.heatCurve, fields.heatFinish];

    if (isLockedPhrase(q)) {
      return [...priorityFields, ...secondaryFields].some(function(text){
        return hasWholePhrase(text, q);
      });
    }

    if (isProtectedWord(q)) {
      return [...priorityFields, ...secondaryFields].some(function(text){
        return hasWholeWord(text, q);
      });
    }

    var parts = q.split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      var allText = [...priorityFields, ...secondaryFields]
        .map(function(text){ return normalizeText(text); })
        .join(' | ');
      return parts.every(function(part){ return allText.includes(part); });
    }

    return [...priorityFields, ...secondaryFields].some(function(text){
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
        if (hasWholeWord(fields.flavorNotes, part)) score += 6;
        if (hasWholeWord(fields.foodStyle,   part)) score += 7;
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

      /* Base relevance score from widget engine */
      var score = matchesSearch(p, query) ? getRelevanceScore(p, query) : 0;

      /* Heat proximity bonus — rewards ±2 window, penalizes cliff drops */
      score += heatProximityBonus(currentLevel, candidateLevel);

      /* Food style match bonus */
      if ((p['Food Style'] || '').toLowerCase().trim() === currentStyle) {
        score += 8;
      }

      return { p: p, score: score };
    }).filter(Boolean);

    /* Sort by score descending */
    scored.sort(function(a, b){ return b.score - a.score; });

    /* Separate sauces and non-sauces from scored pool */
    var scoredSauces    = scored.filter(function(o){ return isSauce(o.p); });
    var scoredNonSauces = scored.filter(function(o){ return isNonSauce(o.p); });

    /* Track used slugs — no duplicates across all 4 slots */
    var used = [currentSlug];
    function notUsed(p){ return used.indexOf(p.slug) === -1; }

    function pickSauce() {
      var candidate = scoredSauces.find(function(o){ return notUsed(o.p); });
      return candidate ? candidate.p : null;
    }

    function pickNonSauce() {
      var candidate = scoredNonSauces.find(function(o){ return notUsed(o.p); });
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

    /* Fallback — nearest non-sauce by flavor/pairing proximity */
    function fallbackNonSauce() {
      var pool = candidates.filter(function(p){
        return isNonSauce(p) && notUsed(p);
      });
      pool.sort(function(a, b){
        return Math.abs(Number(a['Heat Level']||0) - currentLevel) -
               Math.abs(Number(b['Heat Level']||0) - currentLevel);
      });
      return pool.length ? pool[0] : null;
    }

    /* ── Pick slots ── */
    var slot1 = pickSauce()    || fallbackSauce();
    if (slot1) used.push(slot1.slug);

    var slot2 = pickSauce()    || fallbackSauce();
    if (slot2) used.push(slot2.slug);

    var slot3 = pickSauce()    || fallbackSauce();
    if (slot3) used.push(slot3.slug);

    var slot4 = pickNonSauce() || fallbackNonSauce();
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
     7. PUBLIC INTERFACE
     Exposed as window.PJProduct so product pages can call it
     after their JSON fetch completes.
  ══════════════════════════════════════════════════════════════ */

  window.PJProduct = {

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
