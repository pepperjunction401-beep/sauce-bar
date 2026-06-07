/**
 * cart-drawer.js
 * Pepper Junction — Mini Cart Drawer v1
 *
 * Requires:
 * - assets/js/cart-engine.js loaded first
 *
 * Responsibilities:
 * - Inject cart icon/button into existing site header
 * - Create mini cart drawer markup
 * - Render current cart items
 * - Show total item count
 * - Show lightweight badge teaser messages
 * - Provide Continue Shopping, View Full Cart, Checkout Now actions
 *
 * Does NOT:
 * - Own cart math
 * - Own checkout bridge
 * - Talk to Square
 * - Talk to Supabase
 */

(function () {
  'use strict';

  if (!window.PJCart) {
    console.warn('PJCartDrawer: cart-engine.js must load before cart-drawer.js');
    return;
  }

  var DRAWER_ID = 'pj-cart-drawer';
  var OVERLAY_ID = 'pj-cart-overlay';
  var CART_BUTTON_ID = 'pj-cart-toggle';
  var CART_COUNT_ID = 'pj-cart-count';

  function esc(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatMoney(value) {
    return '$' + Number(value || 0).toFixed(2);
  }

  function init() {
    injectHeaderCartButton();
    injectDrawer();
    bindEvents();
    render();
  }

  function injectHeaderCartButton() {
    if (document.getElementById(CART_BUTTON_ID)) return;

    var headerNav = document.querySelector('.header-nav');
    if (!headerNav) {
      console.warn('PJCartDrawer: .header-nav not found.');
      return;
    }

    var btn = document.createElement('button');
    btn.id = CART_BUTTON_ID;
    btn.className = 'pj-cart-toggle';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Open cart');
    btn.setAttribute('aria-controls', DRAWER_ID);
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML =
      '<span class="pj-cart-icon" aria-hidden="true">🛒</span>' +
      '<span class="pj-cart-label">Cart</span>' +
      '<span class="pj-cart-count" id="' + CART_COUNT_ID + '">0</span>';

    headerNav.appendChild(btn);
  }

  function injectDrawer() {
    if (document.getElementById(DRAWER_ID)) return;

    var overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'pj-cart-overlay';
    overlay.setAttribute('hidden', '');

    var drawer = document.createElement('aside');
    drawer.id = DRAWER_ID;
    drawer.className = 'pj-cart-drawer';
    drawer.setAttribute('aria-hidden', 'true');
    drawer.setAttribute('aria-label', 'Pepper Junction cart drawer');

    drawer.innerHTML =
      '<div class="pj-cart-drawer-head">' +
        '<div>' +
          '<div class="pj-cart-drawer-kicker">Current Lineup</div>' +
          '<div class="pj-cart-drawer-title">Your Cart</div>' +
        '</div>' +
        '<button class="pj-cart-close" type="button" aria-label="Close cart">×</button>' +
      '</div>' +

      '<div class="pj-cart-drawer-body">' +
        '<div class="pj-cart-empty">Your lineup is empty.</div>' +
        '<div class="pj-cart-items"></div>' +

        '<div class="pj-cart-teaser" aria-label="Badge progress preview">' +
          '<div class="pj-cart-teaser-row">' +
            '<img class="pj-cart-teaser-img" id="pj-cart-bottle-img" src="../assets/badges/bottle-purchase-coins/badge-coin-penny-obverse.png" alt="" loading="lazy">' +
            '<span class="pj-cart-teaser-val" id="pj-cart-bottle-teaser">Add 3 items to unlock your first Bottle-Purchase Coin.</span>' +
          '</div>' +
          '<div class="pj-cart-teaser-row">' +
            '<img class="pj-cart-teaser-img" id="pj-cart-total-img" src="../assets/badges/check-total/badge-check-total-pickup-sticks.png" alt="" loading="lazy">' +
            '<span class="pj-cart-teaser-val" id="pj-cart-total-teaser">Start your lineup to begin Check-Total progress.</span>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="pj-cart-drawer-foot">' +
        '<div class="pj-cart-subtotal-row">' +
          '<span>Subtotal</span>' +
          '<strong id="pj-cart-subtotal">$0.00</strong>' +
        '</div>' +
        '<button class="pj-cart-action pj-cart-continue" type="button">Continue Shopping</button>' +
        '<a class="pj-cart-action pj-cart-view" href="../cart-page.html">View Full Cart</a>' +
        '<button class="pj-cart-action pj-cart-checkout" type="button">Checkout Now</button>' +
        '<div class="pj-cart-note">Checkout bridge coming soon. Square remains the register.</div>' +
      '</div>';

    document.body.appendChild(overlay);
    document.body.appendChild(drawer);
  }

  function bindEvents() {
    var toggle = document.getElementById(CART_BUTTON_ID);
    var overlay = document.getElementById(OVERLAY_ID);
    var drawer = document.getElementById(DRAWER_ID);

    if (toggle) {
      toggle.addEventListener('click', function () {
        openDrawer();
      });
    }

    if (overlay) {
      overlay.addEventListener('click', closeDrawer);
    }

    if (drawer) {
      drawer.addEventListener('click', function (e) {
        var closeBtn = e.target.closest('.pj-cart-close');
        var continueBtn = e.target.closest('.pj-cart-continue');
        var checkoutBtn = e.target.closest('.pj-cart-checkout');
        var removeBtn = e.target.closest('[data-cart-remove]');
        var incBtn = e.target.closest('[data-cart-inc]');
        var decBtn = e.target.closest('[data-cart-dec]');

        if (closeBtn || continueBtn) {
          closeDrawer();
          return;
        }

        if (checkoutBtn) {
          handleCheckoutNow();
          return;
        }

        if (removeBtn) {
          window.PJCart.removeItem(removeBtn.getAttribute('data-cart-remove'));
          return;
        }

        if (incBtn) {
          window.PJCart.increment(incBtn.getAttribute('data-cart-inc'));
          return;
        }

        if (decBtn) {
          window.PJCart.decrement(decBtn.getAttribute('data-cart-dec'));
          return;
        }
      });
    }

    window.addEventListener(window.PJCart.event, render);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDrawer();
    });
  }

  function openDrawer() {
    var overlay = document.getElementById(OVERLAY_ID);
    var drawer = document.getElementById(DRAWER_ID);
    var toggle = document.getElementById(CART_BUTTON_ID);

    if (overlay) overlay.removeAttribute('hidden');
    if (drawer) {
      drawer.classList.add('open');
      drawer.setAttribute('aria-hidden', 'false');
    }
    if (toggle) toggle.setAttribute('aria-expanded', 'true');

    document.body.classList.add('pj-cart-open');
  }

  function closeDrawer() {
    var overlay = document.getElementById(OVERLAY_ID);
    var drawer = document.getElementById(DRAWER_ID);
    var toggle = document.getElementById(CART_BUTTON_ID);

    if (drawer) {
      drawer.classList.remove('open');
      drawer.setAttribute('aria-hidden', 'true');
    }
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    if (overlay) overlay.setAttribute('hidden', '');

    document.body.classList.remove('pj-cart-open');
  }

  function render() {
    var summary = window.PJCart.getSummary();

    renderCount(summary);
    renderItems(summary);
    renderSubtotal(summary);
    renderBadgeTeasers(summary);
  }

  function renderCount(summary) {
    var countEl = document.getElementById(CART_COUNT_ID);
    if (!countEl) return;

    countEl.textContent = summary.item_count;
    countEl.classList.toggle('has-items', summary.item_count > 0);
  }

  function renderItems(summary) {
    var drawer = document.getElementById(DRAWER_ID);
    if (!drawer) return;

    var emptyEl = drawer.querySelector('.pj-cart-empty');
    var itemsEl = drawer.querySelector('.pj-cart-items');

    if (!itemsEl || !emptyEl) return;

    if (!summary.items.length) {
      emptyEl.style.display = 'block';
      itemsEl.innerHTML = '';
      return;
    }

    emptyEl.style.display = 'none';

    itemsEl.innerHTML = summary.items.map(function (item) {
      var lineTotal = Number(item.price || 0) * Number(item.quantity || 1);
      var image = item.image || '../assets/PJ-logo.png';

      return (
        '<div class="pj-cart-item" data-product-id="' + esc(item.product_id) + '">' +
          '<div class="pj-cart-item-img-wrap">' +
            '<img class="pj-cart-item-img" src="' + esc(image) + '" alt="' + esc(item.product_name) + '" ' +
              'loading="lazy" onerror="this.src=\'../assets/PJ-logo.png\'">' +
          '</div>' +

          '<div class="pj-cart-item-main">' +
            '<div class="pj-cart-item-name">' + esc(item.product_name) + '</div>' +
            (item.brand ? '<div class="pj-cart-item-brand">' + esc(item.brand) + '</div>' : '') +
            '<div class="pj-cart-item-meta">' + formatMoney(item.price) + ' each</div>' +

            '<div class="pj-cart-qty-row">' +
              '<button class="pj-cart-qty-btn" type="button" data-cart-dec="' + esc(item.product_id) + '" aria-label="Decrease quantity">−</button>' +
              '<span class="pj-cart-qty">' + esc(item.quantity) + '</span>' +
              '<button class="pj-cart-qty-btn" type="button" data-cart-inc="' + esc(item.product_id) + '" aria-label="Increase quantity">+</button>' +
              '<button class="pj-cart-remove" type="button" data-cart-remove="' + esc(item.product_id) + '">🗑 Remove</button>' +
            '</div>' +
          '</div>' +

          '<div class="pj-cart-line-total">' + formatMoney(lineTotal) + '</div>' +
        '</div>'
      );
    }).join('');
  }

  function renderSubtotal(summary) {
    var subtotalEl = document.getElementById('pj-cart-subtotal');
    if (subtotalEl) subtotalEl.textContent = summary.subtotal_display;
  }

  function renderBadgeTeasers(summary) {
    var bottleEl  = document.getElementById('pj-cart-bottle-teaser');
    var totalEl   = document.getElementById('pj-cart-total-teaser');
    var bottleImg = document.getElementById('pj-cart-bottle-img');
    var totalImg  = document.getElementById('pj-cart-total-img');

    var badgeBase = '../assets/badges/';

    if (bottleEl && summary.bottle_coin_progress) {
      var bottleProgress = summary.bottle_coin_progress;
      var bottleBadge    = bottleProgress.next || bottleProgress.earned;

      bottleEl.textContent = bottleProgress.message || '';

      if (bottleImg && bottleBadge && bottleBadge.image) {
        bottleImg.src = badgeBase + bottleBadge.image;
        bottleImg.alt = bottleBadge.name || 'Bottle Coin';
      }
    }

    if (totalEl && summary.check_total_progress) {
      var totalProgress = summary.check_total_progress;
      var totalBadge    = totalProgress.next || totalProgress.earned;

      totalEl.textContent = totalProgress.message || '';

      if (totalImg && totalBadge && totalBadge.image) {
        totalImg.src = badgeBase + totalBadge.image;
        totalImg.alt = totalBadge.name || 'Check Total Badge';
      }
    }
  }

  function handleCheckoutNow() {
    var summary = window.PJCart.getSummary();

    if (!summary.items.length) {
      openDrawer();
      return;
    }

    console.info('PJCartDrawer: Checkout bridge not connected yet.', summary);

    var note = document.querySelector('.pj-cart-note');
    if (note) {
      note.textContent = 'Checkout bridge coming soon — cart session is ready for Square handoff.';
      note.classList.add('active');
    }
  }

  document.addEventListener('DOMContentLoaded', init);

  window.PJCartDrawer = {
    init: init,
    open: openDrawer,
    close: closeDrawer,
    render: render
  };

})();
