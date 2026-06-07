/**
 * cart-engine.js
 * Pepper Junction — Session Cart Engine v1
 *
 * Purpose:
 * - Shared cart logic for all product pages
 * - Uses sessionStorage only
 * - No Square checkout logic yet
 * - No Supabase logic yet
 * - No drawer rendering here; cart-drawer.js will listen/render separately
 */

(function () {
  'use strict';

  var CART_KEY = 'pj_cart';
  var CART_EVENT = 'pj-cart-updated';

  function money(value) {
    var n = Number(value || 0);
    return Math.round(n * 100) / 100;
  }

  function normalizeQty(qty) {
    var n = parseInt(qty, 10);
    if (isNaN(n) || n < 1) return 1;
    return n;
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
      image: String(product.image || ''),
      quantity: normalizeQty(product.quantity || 1),
      category: String(product.category || ''),
      heat_category: String(product.heat_category || product.heatCategory || ''),
      food_style: String(product.food_style || product.foodStyle || ''),
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
      existing.image = item.image || existing.image;
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

  function getCartSummary() {
    var cart = readCart();
    var subtotal = getSubtotal();
    var itemCount = getItemCount();

    return {
      items: cart.items,
      item_count: itemCount,
      subtotal: subtotal,
      subtotal_display: '$' + subtotal.toFixed(2),
      bottle_coin_progress: getBottleCoinProgress(itemCount),
      check_total_progress: getCheckTotalProgress(subtotal)
    };
  }

  /**
   * Bottle-Purchase Coins
   * Based on item quantity in this transaction only.
   */
  var BOTTLE_COIN_TIERS = [
    { count: 3, name: 'Lincoln Wheat Penny',       image: 'bottle-purchase-coins/badge-coin-penny-obverse.png',        catchphrase: 'This Makes Sense' },
    { count: 5, name: 'Buffalo Nickel',            image: 'bottle-purchase-coins/badge-coin-nickel-obverse.png',       catchphrase: '5 Alive' },
    { count: 6, name: 'Mercury Dime',              image: 'bottle-purchase-coins/badge-coin-dime-obverse.png',         catchphrase: 'Six-Pack of Legends' },
    { count: 7, name: 'Standing Liberty Quarter',  image: 'bottle-purchase-coins/badge-coin-quarter-obverse.png',      catchphrase: 'Quarter Past Seven' },
    { count: 8, name: 'Walking Liberty Half Dollar', image: 'bottle-purchase-coins/badge-coin-half-dollar-obverse.png', catchphrase: 'Eight to Appreciate' },
    { count: 9, name: 'Peace Dollar',              image: 'bottle-purchase-coins/badge-coin-peace-dollar-obverse.png', catchphrase: 'Peace Is With You' }
  ];

  function getBottleCoinProgress(itemCount) {
    var earned = null;
    var next = null;

    BOTTLE_COIN_TIERS.forEach(function (tier) {
      if (itemCount >= tier.count) earned = tier;
    });

    next = BOTTLE_COIN_TIERS.find(function (tier) {
      return itemCount < tier.count;
    }) || null;

    return {
      current_count: itemCount,
      earned: earned,
      next: next,
      remaining: next ? Math.max(0, next.count - itemCount) : 0,
      message: buildBottleMessage(itemCount, earned, next)
    };
  }

  function buildBottleMessage(itemCount, earned, next) {
    if (!itemCount) return 'Add 3 items to unlock your first Bottle-Purchase Coin.';
    if (!next && earned) return earned.name + ' ready. Top bottle coin tier reached.';
    if (next && next.count - itemCount === 1) return 'One more item earns you the ' + next.name + '.';
    if (next) return (next.count - itemCount) + ' items away from ' + next.name + '.';
    return '';
  }

  /**
   * Check-Total Badges
   * Highest threshold reached only.
   */
  var CHECK_TOTAL_TIERS = [
    { amount: 10,  name: 'Pickup Sticks',      image: 'check-total/badge-check-total-pickup-sticks.png',      catchphrase: 'Every great collection starts with the first pick.' },
    { amount: 25,  name: 'Chinese Checkers',   image: 'check-total/badge-check-total-chinese-checkers.png',   catchphrase: "You're already three jumps ahead." },
    { amount: 40,  name: 'Dominoes',           image: 'check-total/badge-check-total-dominoes.png',           catchphrase: 'One good sauce leads to another. Watch them fall.' },
    { amount: 50,  name: 'Bingo',              image: 'check-total/badge-check-total-bingo.png',              catchphrase: 'Spice Things Up Until You Reach BINGO!' },
    { amount: 60,  name: 'Checkers',           image: 'check-total/badge-check-total-checkers.png',           catchphrase: 'Purchasing like a King!' },
    { amount: 70,  name: 'Parcheesi',          image: 'check-total/badge-check-total-parcheesi.png',          catchphrase: 'No Safe Space Can Contain Your Need for Heat.' },
    { amount: 80,  name: 'Monopoly',           image: 'check-total/badge-check-total-monopoly.png',           catchphrase: "What's Free About Parking?" },
    { amount: 90,  name: 'Scrabble',           image: 'check-total/badge-check-total-scrabble.png',           catchphrase: 'Pssssh.. Now This is a Real Score.' },
    { amount: 100, name: 'Sorry!',             image: 'check-total/badge-check-total-sorry.png',              catchphrase: 'Sliding into this many new sauces feels as fun as the game.' }
  ];

  function getCheckTotalProgress(subtotal) {
    subtotal = money(subtotal);

    var earned = null;
    var next = null;

    CHECK_TOTAL_TIERS.forEach(function (tier) {
      if (subtotal >= tier.amount) earned = tier;
    });

    next = CHECK_TOTAL_TIERS.find(function (tier) {
      return subtotal < tier.amount;
    }) || null;

    return {
      current_total: subtotal,
      earned: earned,
      next: next,
      remaining: next ? money(next.amount - subtotal) : 0,
      message: buildCheckTotalMessage(subtotal, earned, next)
    };
  }

  function buildCheckTotalMessage(subtotal, earned, next) {
    if (!subtotal) return 'Start your lineup to begin Check-Total progress.';
    if (!next && earned) return "You've reached the top tier. Nothing left to prove.";
    if (next) return 'Leveling up to the next badge is $' + money(next.amount - subtotal).toFixed(2) + ' away.';
    return '';
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
      image: el.dataset.image,
      quantity: el.dataset.quantity || 1,
      category: el.dataset.category,
      heat_category: el.dataset.heatCategory,
      food_style: el.dataset.foodStyle
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

    getBottleCoinProgress: getBottleCoinProgress,
    getCheckTotalProgress: getCheckTotalProgress,
    getProductFromElement: getProductFromElement
  };

  notify();

})();
