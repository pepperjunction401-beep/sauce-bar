/**
 * cart-page.js
 * Pepper Junction — Full Cart Page / Junction Progress Station v1
 *
 * Requires:
 * - assets/js/cart-engine.js loaded first
 * - cart-page.html structural IDs present
 *
 * Responsibilities:
 * - Render full cart page contents
 * - Render item count and subtotal
 * - Render Bottle-Purchase Coin progress
 * - Render Check-Total Badge progress
 * - Keep page synced with PJCart sessionStorage
 *
 * Does NOT:
 * - Talk to Square yet
 * - Talk to Supabase yet
 * - Award badges
 * - Process checkout
 */

(function () {
  'use strict';

  if (!window.PJCart) {
    console.warn('PJCartPage: cart-engine.js must load before cart-page.js');
    return;
  }

  var BADGE_BASE = 'assets/badges/';

  function esc(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function money(value) {
    return '$' + Number(value || 0).toFixed(2);
  }

  function init() {
    bindEvents();
    render();
  }

  function bindEvents() {
    var itemsEl = document.getElementById('pj-cart-page-items');
    var checkoutBtn = document.getElementById('pj-cart-page-checkout');

    if (itemsEl) {
      itemsEl.addEventListener('click', function (e) {
        var removeBtn = e.target.closest('[data-cart-page-remove]');
        var incBtn = e.target.closest('[data-cart-page-inc]');
        var decBtn = e.target.closest('[data-cart-page-dec]');

        if (removeBtn) {
          window.PJCart.removeItem(removeBtn.getAttribute('data-cart-page-remove'));
          return;
        }

        if (incBtn) {
          window.PJCart.increment(incBtn.getAttribute('data-cart-page-inc'));
          return;
        }

        if (decBtn) {
          window.PJCart.decrement(decBtn.getAttribute('data-cart-page-dec'));
          return;
        }
      });
    }

    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', handleCheckout);
    }

    window.addEventListener(window.PJCart.event, render);
  }

  function render() {
    var summary = window.PJCart.getSummary();

    renderItems(summary);
    renderSummary(summary);
    renderBottleProgress(summary.bottle_coin_progress);
    renderCheckTotalProgress(summary.check_total_progress);
  }

  function renderItems(summary) {
    var emptyEl = document.getElementById('pj-cart-page-empty');
    var itemsEl = document.getElementById('pj-cart-page-items');

    if (!emptyEl || !itemsEl) return;

    if (!summary.items.length) {
      emptyEl.style.display = 'block';
      itemsEl.innerHTML = '';
      return;
    }

    emptyEl.style.display = 'none';

    itemsEl.innerHTML = summary.items.map(function (item) {
      var lineTotal = Number(item.price || 0) * Number(item.quantity || 1);
      var image = item.image || 'assets/PJ-logo.png';
      var productUrl = item.slug ? 'products/' + item.slug + '.html' : '#';

      return (
        '<article class="pj-cart-page-item" data-product-id="' + esc(item.product_id) + '">' +

          '<a class="pj-cart-page-item-img-wrap" href="' + esc(productUrl) + '">' +
            '<img class="pj-cart-page-item-img" src="' + esc(normalizeImagePath(image)) + '" alt="' + esc(item.product_name) + '" ' +
              'loading="lazy" onerror="this.src=\'assets/PJ-logo.png\'">' +
          '</a>' +

          '<div class="pj-cart-page-item-main">' +
            '<div class="pj-cart-page-item-brand">' + esc(item.brand || 'Pepper Junction') + '</div>' +
            '<a class="pj-cart-page-item-name" href="' + esc(productUrl) + '">' + esc(item.product_name) + '</a>' +
            '<div class="pj-cart-page-item-meta">' +
              esc(item.category || '') +
              (item.heat_category ? ' · ' + esc(item.heat_category) : '') +
            '</div>' +

            '<div class="pj-cart-page-qty-row">' +
              '<button class="pj-cart-page-qty-btn" type="button" data-cart-page-dec="' + esc(item.product_id) + '" aria-label="Decrease quantity">−</button>' +
              '<span class="pj-cart-page-qty">' + esc(item.quantity) + '</span>' +
              '<button class="pj-cart-page-qty-btn" type="button" data-cart-page-inc="' + esc(item.product_id) + '" aria-label="Increase quantity">+</button>' +
              '<button class="pj-cart-page-remove" type="button" data-cart-page-remove="' + esc(item.product_id) + '">Remove</button>' +
            '</div>' +
          '</div>' +

          '<div class="pj-cart-page-item-price">' +
            '<span>' + money(item.price) + ' each</span>' +
            '<strong>' + money(lineTotal) + '</strong>' +
          '</div>' +

        '</article>'
      );
    }).join('');
  }

  function renderSummary(summary) {
    var countEl = document.getElementById('pj-cart-page-count');
    var subtotalEl = document.getElementById('pj-cart-page-subtotal');
    var checkoutBtn = document.getElementById('pj-cart-page-checkout');

    if (countEl) countEl.textContent = summary.item_count;
    if (subtotalEl) subtotalEl.textContent = summary.subtotal_display;

    if (checkoutBtn) {
      checkoutBtn.disabled = summary.item_count === 0;
      checkoutBtn.classList.toggle('disabled', summary.item_count === 0);
    }
  }

  function renderBottleProgress(progress) {
    if (!progress) return;

    var imgEl = document.getElementById('pj-progress-bottle-img');
    var titleEl = document.getElementById('pj-progress-bottle-title');
    var msgEl = document.getElementById('pj-progress-bottle-message');
    var barEl = document.getElementById('pj-progress-bottle-bar');

    var badge = progress.next || progress.earned;
    var title = badge ? badge.name : 'Bottle-Purchase Coin';

    if (imgEl && badge && badge.image) {
      imgEl.src = BADGE_BASE + badge.image;
      imgEl.alt = badge.name || 'Bottle-Purchase Coin';
    }

    if (titleEl) {
      titleEl.textContent = progress.earned && !progress.next
        ? progress.earned.name
        : title;
    }

    if (msgEl) {
      msgEl.textContent = progress.message || '';
    }

    if (barEl) {
      barEl.style.width = getBottleProgressPercent(progress) + '%';
    }
  }

  function renderCheckTotalProgress(progress) {
    if (!progress) return;

    var imgEl = document.getElementById('pj-progress-total-img');
    var titleEl = document.getElementById('pj-progress-total-title');
    var msgEl = document.getElementById('pj-progress-total-message');
    var barEl = document.getElementById('pj-progress-total-bar');

    var badge = progress.next || progress.earned;
    var title = badge ? badge.name : 'Check-Total Badge';

    if (imgEl && badge && badge.image) {
      imgEl.src = BADGE_BASE + badge.image;
      imgEl.alt = badge.name || 'Check-Total Badge';
    }

    if (titleEl) {
      titleEl.textContent = progress.earned && !progress.next
        ? progress.earned.name
        : title;
    }

    if (msgEl) {
      msgEl.textContent = progress.message || '';
    }

    if (barEl) {
      barEl.style.width = getCheckTotalProgressPercent(progress) + '%';
    }
  }

  function getBottleProgressPercent(progress) {
    if (!progress.next && progress.earned) return 100;

    var target = progress.next ? progress.next.count : 3;
    if (!target) return 0;

    return clampPercent((progress.current_count / target) * 100);
  }

  function getCheckTotalProgressPercent(progress) {
    if (!progress.next && progress.earned) return 100;

    var target = progress.next ? progress.next.amount : 10;
    if (!target) return 0;

    return clampPercent((progress.current_total / target) * 100);
  }

  function clampPercent(value) {
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  function normalizeImagePath(path) {
    /*
     * Product pages store item.image as ../assets/...
     * cart-page.html lives at repo root, so convert leading ../assets/
     * to assets/ for this page.
     */
    return String(path || '').replace(/^\.\.\/assets\//, 'assets/');
  }

  function handleCheckout() {
    var summary = window.PJCart.getSummary();

    if (!summary.items.length) return;

    console.info('PJCartPage: Checkout bridge not connected yet.', summary);

    var btn = document.getElementById('pj-cart-page-checkout');
    if (btn) {
      btn.textContent = 'Checkout Bridge Coming Soon';
      setTimeout(function () {
        btn.textContent = 'Checkout Now';
      }, 2200);
    }
  }

  document.addEventListener('DOMContentLoaded', init);

  window.PJCartPage = {
    init: init,
    render: render
  };

})();
