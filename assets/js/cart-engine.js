/**
 * cart-engine.js
 * Pepper Junction — Session Cart Engine v2.1
 *
 * Purpose:
 * - Shared cart logic for all product pages
 * - Uses sessionStorage only
 * - No Square checkout logic yet
 * - No Supabase logic yet
 * - No drawer rendering here
 *
 * v2 Badge Model:
 * - Item Purchase Achievement
 * - Purchase Progress Badge
 * - Heat Badges
 * - Food Category Badges
 * - Celestial Badge
 *
 * Critical rules:
 * - Highest tier only
 * - Quantity-based counting
 * - Session-only by default
 * - Supabase-ready hooks, but no Supabase dependency
 * - Secret badges and Year of the Horse do not surface in cart
 */

(function () {
  'use strict';

  var CART_KEY = 'pj_cart';
  var CART_EVENT = 'pj-cart-updated';

  /*
   * Future Supabase shape:
   * This remains null in v2.
   * Later, account lifetime counts can be merged here before progress calculation.
   */
  var lifetimeContext = null;

  function money(value) {
    var n = Number(value || 0);
    return Math.round(n * 100) / 100;
  }

  function normalizeQty(qty) {
    var n = parseInt(qty, 10);
    if (isNaN(n) || n < 1) return 1;
    return n;
  }

  function slugify(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function readCart() {
    try {
      var raw = sessionStorage.getItem(CART_KEY);
      if (!raw) return { items: [] };

      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.items)) {
        return { items: [] };
      }

      return parsed;
    } catch (e) {
      return { items: [] };
    }
  }

  function writeCart(cart) {
    try {
      sessionStorage.setItem(CART_KEY, JSON.stringify(cart));
      notify();
    } catch (e) {
      console.warn('PJCart: sessionStorage unavailable.', e);
    }
  }

  function notify() {
    try {
      window.dispatchEvent(new CustomEvent(CART_EVENT, {
        detail: getCartSummary()
      }));
    } catch (e) {}
  }

  function normalizeProduct(product) {
    if (!product) {
      throw new Error('PJCart.addItem requires a product object.');
    }

    var productId = product.product_id || product.productId || product.slug;

    if (!productId) {
      throw new Error('PJCart product requires product_id or slug.');
    }

    var price = money(product.price);

    return {
      product_id: String(productId),
      slug: String(product.slug || productId),
      product_name: String(product.product_name || product.productName || product.name || 'Pepper Junction Product'),
      brand: String(product.brand || ''),
      price: price,
      square_id: String(product.square_id || product.squareId || ''),
      square_url: String(product.square_url || product.squareUrl || ''),
      image: String(product.image || ''),
      quantity: normalizeQty(product.quantity || 1),

      /*
       * Product intelligence metadata.
       * These values come from CNS/product page integration.
       */
      category: String(product.category || ''),
      heat_category: String(product.heat_category || product.heatCategory || ''),
      food_style: String(product.food_style || product.foodStyle || ''),
      best_pairings: String(product.best_pairings || product.bestPairings || product['Best Food Pairings'] || ''),

      added_at: product.added_at || new Date().toISOString()
    };
  }

  function addItem(product) {
    var item = normalizeProduct(product);
    var cart = readCart();

    var existing = cart.items.find(function (x) {
      return x.product_id === item.product_id;
    });

    if (existing) {
      existing.quantity = normalizeQty(existing.quantity) + item.quantity;
      existing.price = item.price;
      existing.square_id = item.square_id || existing.square_id;
      existing.square_url = item.square_url || existing.square_url;
      existing.image = item.image || existing.image;
      existing.category = item.category || existing.category;
      existing.heat_category = item.heat_category || existing.heat_category;
      existing.food_style = item.food_style || existing.food_style;
      existing.best_pairings = item.best_pairings || existing.best_pairings;
    } else {
      cart.items.push(item);
    }

    writeCart(cart);
    return getCartSummary();
  }

  function removeItem(productId) {
    var cart = readCart();
    cart.items = cart.items.filter(function (item) {
      return item.product_id !== productId;
    });
    writeCart(cart);
    return getCartSummary();
  }

  function updateQuantity(productId, quantity) {
    var qty = normalizeQty(quantity);
    var cart = readCart();

    cart.items = cart.items.map(function (item) {
      if (item.product_id === productId) {
        item.quantity = qty;
      }
      return item;
    });

    writeCart(cart);
    return getCartSummary();
  }

  function increment(productId) {
    var cart = readCart();

    cart.items = cart.items.map(function (item) {
      if (item.product_id === productId) {
        item.quantity = normalizeQty(item.quantity) + 1;
      }
      return item;
    });

    writeCart(cart);
    return getCartSummary();
  }

  function decrement(productId) {
    var cart = readCart();

    cart.items = cart.items.reduce(function (items, item) {
      if (item.product_id === productId) {
        var newQty = normalizeQty(item.quantity) - 1;

        if (newQty < 1) {
          return items;
        }

        item.quantity = newQty;
      }

      items.push(item);
      return items;
    }, []);

    writeCart(cart);
    return getCartSummary();
  }

  function clearCart() {
    try {
      sessionStorage.removeItem(CART_KEY);
      notify();
    } catch (e) {}
    return getCartSummary();
  }

  function getItemCount() {
    var cart = readCart();
    return cart.items.reduce(function (sum, item) {
      return sum + normalizeQty(item.quantity);
    }, 0);
  }

  function getSubtotal() {
    var cart = readCart();
    return money(cart.items.reduce(function (sum, item) {
      return sum + money(item.price) * normalizeQty(item.quantity);
    }, 0));
  }

  /*
   * Item Purchase Achievement
   * Formerly Bottle Coin / Bottle-Purchase Coin.
   * Based on item quantity in this transaction only.
   */
  var ITEM_PURCHASE_ACHIEVEMENT_TIERS = [
    {
      threshold: 3,
      name: 'Lincoln Wheat Penny',
      image: 'bottle-purchase-coins/badge-coin-penny-obverse.png',
      catchphrase: 'This Makes Sense'
    },
    {
      threshold: 5,
      name: 'Buffalo Nickel',
      image: 'bottle-purchase-coins/badge-coin-nickel-obverse.png',
      catchphrase: '5 Alive'
    },
    {
      threshold: 6,
      name: 'Mercury Dime',
      image: 'bottle-purchase-coins/badge-coin-dime-obverse.png',
      catchphrase: 'Six-Pack of Legends'
    },
    {
      threshold: 7,
      name: 'Standing Liberty Quarter',
      image: 'bottle-purchase-coins/badge-coin-quarter-obverse.png',
      catchphrase: 'Quarter Past Seven'
    },
    {
      threshold: 8,
      name: 'Walking Liberty Half Dollar',
      image: 'bottle-purchase-coins/badge-coin-half-dollar-obverse.png',
      catchphrase: 'Eight to Appreciate'
    },
    {
      threshold: 9,
      name: 'Peace Dollar',
      image: 'bottle-purchase-coins/badge-coin-peace-dollar-obverse.png',
      catchphrase: 'Peace Is With You'
    }
  ];

  /*
   * Purchase Progress Badge
   * Formerly Check Total / Check Total Badge.
   * Based on current transaction subtotal.
   *
   * Current board-game art remains placeholder until 1930s-era art arrives.
   */
  var PURCHASE_PROGRESS_BADGE_TIERS = [
    {
      threshold: 10,
      name: 'Pickup Sticks',
      image: 'check-total/badge-check-total-pickup-sticks.png',
      catchphrase: 'Every great collection starts with the first pick.'
    },
    {
      threshold: 25,
      name: 'Chinese Checkers',
      image: 'check-total/badge-check-total-chinese-checkers.png',
      catchphrase: "You're already three jumps ahead."
    },
    {
      threshold: 40,
      name: 'Dominoes',
      image: 'check-total/badge-check-total-dominoes.png',
      catchphrase: 'One good sauce leads to another. Watch them fall.'
    },
    {
      threshold: 50,
      name: 'Bingo',
      image: 'check-total/badge-check-total-bingo.png',
      catchphrase: 'Spice Things Up Until You Reach BINGO!'
    },
    {
      threshold: 60,
      name: 'Checkers',
      image: 'check-total/badge-check-total-checkers.png',
      catchphrase: 'Purchasing like a King!'
    },
    {
      threshold: 70,
      name: 'Parcheesi',
      image: 'check-total/badge-check-total-parcheesi.png',
      catchphrase: 'No Safe Space Can Contain Your Need for Heat.'
    },
    {
      threshold: 80,
      name: 'Monopoly',
      image: 'check-total/badge-check-total-monopoly.png',
      catchphrase: "What's Free About Parking?"
    },
    {
      threshold: 90,
      name: 'Scrabble',
      image: 'check-total/badge-check-total-scrabble.png',
      catchphrase: 'Pssssh.. Now This is a Real Score.'
    },
    {
      threshold: 100,
      name: 'Sorry!',
      image: 'check-total/badge-check-total-sorry.png',
      catchphrase: 'Sliding into this many new sauces feels as fun as the game.'
    },
    {
      threshold: 125,
      name: 'Grand Prize',
      image: '',
      catchphrase: 'Top shelf move.'
    }
  ];

  /*
   * Heat Badge tiers.
   * Highest tier only per heat category.
   */
  var HEAT_BADGE_TIERS = [
    { threshold: 5, level: 1, label: 'L1' },
    { threshold: 10, level: 2, label: 'L2' },
    { threshold: 15, level: 3, label: 'L3' }
  ];

  /*
   * Food Category Badges.
   * v2 uses a 5 qualifying purchase threshold.
   */
  var FOOD_CATEGORY_BADGE_THRESHOLD = 5;

  var FOOD_CATEGORY_RULES = [
    {
      key: 'asian',
      name: 'Asian',
      image: 'food/badge-food-asian.png',
      keywords: ['asian', 'sushi', 'rice bowl', 'stir fry', 'noodles', 'soy', 'teriyaki']
    },
    {
      key: 'bbq-dry-rubs',
      name: 'BBQ / Dry Rubs',
      image: 'food/badge-food-bbq-dry-rubs.png',
      keywords: ['bbq', 'barbecue', 'dry rub', 'ribs', 'brisket', 'pulled pork', 'smoked']
    },
    {
      key: 'caribbean',
      name: 'Caribbean',
      image: 'food/badge-food-caribbean.png',
      keywords: ['caribbean', 'tropical', 'jerk', 'pineapple', 'mango']
    },
    {
      key: 'chicken-wings',
      name: 'Chicken Wings',
      image: 'food/badge-food-chicken-wings.png',
      keywords: ['wing', 'wings', 'buffalo chicken', 'buffalo dip']
    },
    {
      key: 'condiments',
      name: 'Condiments',
      image: 'food/badge-food-condiments.png',
      keywords: ['condiment', 'ketchup', 'mustard', 'burger', 'hot dog', 'sandwich']
    },
    {
      key: 'eggs-breakfast',
      name: 'Eggs / Breakfast',
      image: 'food/badge-food-eggs-breakfast.png',
      keywords: ['egg', 'eggs', 'breakfast', 'breakfast burrito', 'breakfast sandwich', 'home fries']
    },
    {
      key: 'fruit',
      name: 'Fruit',
      image: 'food/badge-food-fruit.png',
      keywords: ['fruit', 'fruity', 'tropical', 'peach', 'pineapple', 'papaya', 'mango']
    },
    {
      key: 'garlic',
      name: 'Garlic',
      image: 'food/badge-food-garlic.png',
      keywords: ['garlic']
    },
    {
      key: 'indian',
      name: 'Indian',
      image: 'food/badge-food-indian.png',
      keywords: ['indian', 'curry', 'tikka', 'masala']
    },
    {
      key: 'mexican',
      name: 'Mexican',
      image: 'food/badge-food-mexican.png',
      keywords: ['mexican', 'taco', 'tacos', 'quesadilla', 'burrito', 'enchilada', 'guacamole']
    },
    {
      key: 'olive-oil-vinegar',
      name: 'Olive Oil & Vinegar',
      image: 'food/badge-food-olive-oil-vinegar.png',
      keywords: ['olive oil', 'vinegar', 'balsamic', 'mediterranean']
    },
    {
      key: 'seasonings',
      name: 'Seasonings',
      image: 'food/badge-food-seasonings.png',
      keywords: ['seasoning', 'spg', 'rub', 'dry rub']
    },
    {
      key: 'shore-dinners',
      name: 'Shore Dinners',
      image: 'food/badge-food-shore-dinners.png',
      keywords: ['oyster', 'oysters', 'clam', 'clams', 'lobster', 'seafood', 'fish', 'shore dinner']
    },
    {
      key: 'snacks',
      name: 'Snacks',
      image: 'food/badge-food-snacks.png',
      keywords: ['snack', 'chips', 'pretzel', 'popcorn']
    },
    {
      key: 'verde',
      name: 'Verde',
      image: 'food/badge-food-verde.png',
      keywords: ['verde', 'green sauce', 'tomatillo']
    }
  ];

  /*
   * Celestial monthly badge.
   * This surfaces the monthly zodiac badge only.
   * Secret monthly-completion badges and Year of the Horse do not surface in cart.
   */
  var CELESTIAL_MONTHS = [
    { slug: 'aquarius', name: 'Aquarius' },
    { slug: 'pisces', name: 'Pisces' },
    { slug: 'aries', name: 'Aries' },
    { slug: 'taurus', name: 'Taurus' },
    { slug: 'gemini', name: 'Gemini' },
    { slug: 'cancer', name: 'Cancer' },
    { slug: 'leo', name: 'Leo' },
    { slug: 'virgo', name: 'Virgo' },
    { slug: 'libra', name: 'Libra' },
    { slug: 'scorpio', name: 'Scorpio' },
    { slug: 'sagittarius', name: 'Sagittarius' },
    { slug: 'capricorn', name: 'Capricorn' }
  ];

  var MONTH_LABELS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  function getHighestEarnedTier(value, tiers) {
    var earned = null;

    tiers.forEach(function (tier) {
      if (value >= tier.threshold) {
        earned = tier;
      }
    });

    return earned;
  }

  function getNextTier(value, tiers) {
    return tiers.find(function (tier) {
      return value < tier.threshold;
    }) || null;
  }

  function makeProgressModel(options) {
    var current = Number(options.current || 0);
    var tiers = options.tiers || [];
    var category = options.category || '';
    var type = options.type || '';
    var label = options.label || '';
    var imageBuilder = options.imageBuilder || null;
    var emptyMessage = options.emptyMessage || '';
    var earnedMessageBuilder = options.earnedMessageBuilder || null;
    var brewingMessageBuilder = options.brewingMessageBuilder || null;

    var earned = getHighestEarnedTier(current, tiers);
    var next = getNextTier(current, tiers);

    function decorateTier(tier) {
      if (!tier) return null;

      var decorated = {};
      Object.keys(tier).forEach(function (key) {
        decorated[key] = tier[key];
      });

      decorated.type = type;
      decorated.category = category;
      decorated.label = label;

      if (!decorated.image && imageBuilder) {
        decorated.image = imageBuilder(decorated);
      }

      return decorated;
    }

    var earnedDecorated = decorateTier(earned);
    var nextDecorated = decorateTier(next);

    return {
      type: type,
      category: category,
      label: label,
      current: current,
      earned: earnedDecorated,
      next: nextDecorated,
      remaining: next ? Math.max(0, money(next.threshold - current)) : 0,
      is_complete: !!earnedDecorated && !nextDecorated,
      unlocked_message: earnedDecorated && earnedMessageBuilder
        ? earnedMessageBuilder(current, earnedDecorated, nextDecorated)
        : '',
      brewing_message: nextDecorated && brewingMessageBuilder
        ? brewingMessageBuilder(current, earnedDecorated, nextDecorated)
        : (current ? '' : emptyMessage)
    };
  }

  function getItemPurchaseAchievementProgress(itemCount) {
    return makeProgressModel({
      type: 'item_purchase_achievement',
      label: 'Item Purchase Achievement',
      current: itemCount,
      tiers: ITEM_PURCHASE_ACHIEVEMENT_TIERS,
      emptyMessage: 'Add 3 items to unlock your first Item Purchase Achievement.',
      earnedMessageBuilder: function (current, earned, next) {
        if (!next) return earned.name + ' ready. Top item purchase tier reached.';
        return earned.name + ' unlocked for this transaction.';
      },
      brewingMessageBuilder: function (current, earned, next) {
        var remaining = next.threshold - current;
        if (!current) return 'Add 3 items to unlock your first Item Purchase Achievement.';
        if (remaining === 1) return 'One more item earns you the ' + next.name + '.';
        return remaining + ' items away from ' + next.name + '.';
      }
    });
  }

  function getPurchaseProgressBadgeProgress(subtotal) {
    subtotal = money(subtotal);

    return makeProgressModel({
      type: 'purchase_progress_badge',
      label: 'Purchase Progress Badge',
      current: subtotal,
      tiers: PURCHASE_PROGRESS_BADGE_TIERS,
      emptyMessage: 'Start your lineup to begin Purchase Progress Badge progress.',
      earnedMessageBuilder: function (current, earned, next) {
        if (!next) return earned.name + ' unlocked. Top purchase progress tier reached.';
        return earned.name + ' unlocked for this transaction.';
      },
      brewingMessageBuilder: function (current, earned, next) {
        if (!current) return 'Start your lineup to begin Purchase Progress Badge progress.';
        return '$' + money(next.threshold - current).toFixed(2) + ' away from ' + next.name + '.';
      }
    });
  }

  function getHeatCounts(items) {
    var counts = {};

    items.forEach(function (item) {
      var heat = String(item.heat_category || '').trim();
      if (!heat) return;

      var key = slugify(heat);
      if (!counts[key]) {
        counts[key] = {
          key: key,
          name: heat,
          count: 0
        };
      }

      counts[key].count += normalizeQty(item.quantity);
    });

    return counts;
  }

  function buildHeatTier(category, tier) {
    var label = category.name + ' Heat ' + tier.label;

    return {
      threshold: tier.threshold,
      name: label,
      level: tier.level,
      label: tier.label,
      image: 'heat/badge-heat-' + category.key + '-l' + tier.level + '.png'
    };
  }

  function getHeatBadgeProgress(items) {
    var counts = getHeatCounts(items);
    var models = [];

    Object.keys(counts).forEach(function (key) {
      var category = counts[key];

      var tiers = HEAT_BADGE_TIERS.map(function (tier) {
        return buildHeatTier(category, tier);
      });

      models.push(makeProgressModel({
        type: 'heat_badge',
        category: category.key,
        label: 'Heat Badge',
        current: category.count,
        tiers: tiers,
        emptyMessage: '',
        earnedMessageBuilder: function (current, earned, next) {
          return earned.name + ' unlocked for this transaction.';
        },
        brewingMessageBuilder: function (current, earned, next) {
          var remaining = next.threshold - current;
          if (remaining === 1) return 'One more ' + category.name + ' item moves you toward ' + next.name + '.';
          return remaining + ' ' + category.name + ' items away from ' + next.name + '.';
        }
      }));
    });

    return models;
  }

  function productTextForFoodMatching(item) {
    return [
      item.category,
      item.food_style,
      item.best_pairings,
      item.product_name
    ].join(' ').toLowerCase();
  }

  function getFoodCounts(items) {
    var counts = {};

    FOOD_CATEGORY_RULES.forEach(function (rule) {
      counts[rule.key] = {
        rule: rule,
        count: 0
      };
    });

    items.forEach(function (item) {
      var text = productTextForFoodMatching(item);
      var qty = normalizeQty(item.quantity);

      FOOD_CATEGORY_RULES.forEach(function (rule) {
        var matches = rule.keywords.some(function (keyword) {
          return text.indexOf(keyword.toLowerCase()) !== -1;
        });

        if (matches) {
          counts[rule.key].count += qty;
        }
      });
    });

    return counts;
  }

  function getFoodCategoryBadgeProgress(items) {
    var counts = getFoodCounts(items);
    var models = [];

    Object.keys(counts).forEach(function (key) {
      var entry = counts[key];
      var rule = entry.rule;
      var count = entry.count;

      if (count <= 0) return;

      models.push(makeProgressModel({
        type: 'food_category_badge',
        category: rule.key,
        label: 'Food Category Badge',
        current: count,
        tiers: [{
          threshold: FOOD_CATEGORY_BADGE_THRESHOLD,
          name: rule.name,
          image: rule.image
        }],
        emptyMessage: '',
        earnedMessageBuilder: function () {
          return rule.name + ' badge unlocked for this transaction.';
        },
        brewingMessageBuilder: function (current, earned, next) {
          var remaining = next.threshold - current;
          if (remaining === 1) return 'One more qualifying item moves you toward the ' + rule.name + ' badge.';
          return remaining + ' qualifying items away from the ' + rule.name + ' badge.';
        }
      }));
    });

    return models;
  }

  function getCelestialBadgeCard(itemCount) {
    if (!itemCount) return null;

    var now = new Date();
    var monthIndex = now.getMonth();
    var year = now.getFullYear();
    var celestial = CELESTIAL_MONTHS[monthIndex];

    if (!celestial) return null;

    var monthLabel = MONTH_LABELS[monthIndex] || '';
    var badgeName = celestial.name + ' Celestial Badge';

    return {
      type: 'celestial_badge',
      category: celestial.slug,
      label: 'Celestial Badge',
      name: badgeName,
      image: 'celestial/badge-celestial-' + celestial.slug + '-' + year + '.png',
      message: monthLabel + ' · ' + year + ' monthly Celestial Badge unlocked for this purchase.',
      current: 1,
      threshold: 1,
      percent: 100,
      state: 'unlocked'
    };
  }

  function sortBrewingByClosest(a, b) {
    var ar = Number(a.remaining || 999999);
    var br = Number(b.remaining || 999999);
    return ar - br;
  }

  function toUnlockedCard(progress) {
    if (!progress || !progress.earned) return null;

    return {
      type: progress.type,
      category: progress.category,
      label: progress.label,
      name: progress.earned.name,
      image: progress.earned.image || '',
      message: progress.unlocked_message || progress.earned.catchphrase || 'Unlocked for this transaction.',
      current: progress.current,
      threshold: progress.earned.threshold,
      percent: 100,
      state: 'unlocked'
    };
  }

  function toBrewingCard(progress) {
    if (!progress || !progress.next) return null;

    return {
      type: progress.type,
      category: progress.category,
      label: progress.label,
      name: progress.next.name,
      image: progress.next.image || '',
      message: progress.brewing_message || 'Keep building your lineup.',
      current: progress.current,
      threshold: progress.next.threshold,
      remaining: progress.remaining,
      percent: progress.next.threshold
        ? Math.max(0, Math.min(100, Math.round((progress.current / progress.next.threshold) * 100)))
        : 0,
      state: 'brewing'
    };
  }

  function getBadgeProgressModel(cart, subtotal, itemCount) {
    cart = cart || readCart();

    /*
     * Supabase hook.
     * When accounts are live, lifetimeContext can be merged here.
     * v2 intentionally keeps this session-only.
     */
    var accountContext = lifetimeContext || {
      connected: false,
      lifetime_heat_counts: {},
      lifetime_food_counts: {},
      lifetime_badges: []
    };

    var itemPurchase = getItemPurchaseAchievementProgress(itemCount);
    var purchaseProgress = getPurchaseProgressBadgeProgress(subtotal);
    var heatModels = getHeatBadgeProgress(cart.items);
    var foodModels = getFoodCategoryBadgeProgress(cart.items);
    var celestialCard = getCelestialBadgeCard(itemCount);

    var unlocked = [];
    var brewing = [];

    if (celestialCard) {
      unlocked.push(celestialCard);
    }

    [
      itemPurchase,
      purchaseProgress
    ].forEach(function (model) {
      var unlockedCard = toUnlockedCard(model);
      var brewingCard = toBrewingCard(model);

      if (unlockedCard) unlocked.push(unlockedCard);
      if (brewingCard) brewing.push(brewingCard);
    });

    heatModels.forEach(function (model) {
      var unlockedCard = toUnlockedCard(model);
      if (unlockedCard) unlocked.push(unlockedCard);
    });

    var heatBrewingCandidates = heatModels
      .map(toBrewingCard)
      .filter(Boolean)
      .sort(sortBrewingByClosest);

    if (heatBrewingCandidates.length) {
      brewing.push(heatBrewingCandidates[0]);
    }

    foodModels.forEach(function (model) {
      var unlockedCard = toUnlockedCard(model);
      if (unlockedCard) unlocked.push(unlockedCard);
    });

    var foodBrewingCandidates = foodModels
      .map(toBrewingCard)
      .filter(Boolean)
      .sort(sortBrewingByClosest);

    if (foodBrewingCandidates.length) {
      brewing.push(foodBrewingCandidates[0]);
    }

    return {
      account_connected: !!accountContext.connected,
      unlocked: unlocked,
      brewing: brewing,
      raw: {
        celestial_badge: celestialCard,
        item_purchase_achievement: itemPurchase,
        purchase_progress_badge: purchaseProgress,
        heat_badges: heatModels,
        food_category_badges: foodModels
      }
    };
  }

  function getCartSummary() {
    var cart = readCart();
    var subtotal = getSubtotal();
    var itemCount = getItemCount();
    var badgeProgress = getBadgeProgressModel(cart, subtotal, itemCount);

    return {
      items: cart.items,
      item_count: itemCount,
      subtotal: subtotal,
      subtotal_display: '$' + subtotal.toFixed(2),

      celestial_badge: badgeProgress.raw.celestial_badge,
      item_purchase_achievement_progress: badgeProgress.raw.item_purchase_achievement,
      purchase_progress_badge_progress: badgeProgress.raw.purchase_progress_badge,
      heat_badge_progress: badgeProgress.raw.heat_badges,
      food_category_badge_progress: badgeProgress.raw.food_category_badges,
      badge_progress: badgeProgress,

      bottle_coin_progress: legacyBottleAlias(badgeProgress.raw.item_purchase_achievement),
      check_total_progress: legacyCheckTotalAlias(badgeProgress.raw.purchase_progress_badge)
    };
  }

  function legacyBottleAlias(progress) {
    if (!progress) return null;

    return {
      current_count: progress.current,
      earned: progress.earned,
      next: progress.next,
      remaining: progress.remaining,
      message: progress.next ? progress.brewing_message : progress.unlocked_message
    };
  }

  function legacyCheckTotalAlias(progress) {
    if (!progress) return null;

    return {
      current_total: progress.current,
      earned: progress.earned,
      next: progress.next,
      remaining: progress.remaining,
      message: progress.next ? progress.brewing_message : progress.unlocked_message
    };
  }

  function setLifetimeContext(context) {
    lifetimeContext = context || null;
    notify();
    return getCartSummary();
  }

  function getProductFromElement(el) {
    if (!el) return null;

    return {
      product_id: el.dataset.productId || el.dataset.slug,
      slug: el.dataset.slug || el.dataset.productId,
      product_name: el.dataset.productName || el.dataset.name,
      brand: el.dataset.brand,
      price: el.dataset.price,
      square_id: el.dataset.squareId,
      square_url: el.dataset.squareUrl,
      image: el.dataset.image,
      quantity: el.dataset.quantity || 1,
      category: el.dataset.category,
      heat_category: el.dataset.heatCategory,
      food_style: el.dataset.foodStyle,
      best_pairings: el.dataset.bestPairings
    };
  }

  window.PJCart = {
    key: CART_KEY,
    event: CART_EVENT,

    read: readCart,
    write: writeCart,
    clear: clearCart,

    addItem: addItem,
    removeItem: removeItem,
    updateQuantity: updateQuantity,
    increment: increment,
    decrement: decrement,

    getItemCount: getItemCount,
    getSubtotal: getSubtotal,
    getSummary: getCartSummary,

    getCelestialBadgeCard: getCelestialBadgeCard,
    getItemPurchaseAchievementProgress: getItemPurchaseAchievementProgress,
    getPurchaseProgressBadgeProgress: getPurchaseProgressBadgeProgress,
    getHeatBadgeProgress: getHeatBadgeProgress,
    getFoodCategoryBadgeProgress: getFoodCategoryBadgeProgress,
    getBadgeProgressModel: getBadgeProgressModel,

    setLifetimeContext: setLifetimeContext,
    getProductFromElement: getProductFromElement,

    getBottleCoinProgress: getItemPurchaseAchievementProgress,
    getCheckTotalProgress: getPurchaseProgressBadgeProgress
  };

  notify();

})();
