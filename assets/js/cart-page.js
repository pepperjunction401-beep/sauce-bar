/**
 * cart-page.js
 * Pepper Junction — Full Cart Page / Junction Progress Station v2.1
 *
 * Requires:
 * - assets/js/cart-engine.js loaded first
 * - cart-page.html v2 structural IDs present
 *
 * Responsibilities:
 * - Render full cart page contents
 * - Render item count and subtotal
 * - Render Badges Unlocked
 * - Render Badges Brewing
 * - Render Item Purchase Achievement progress
 * - Render Purchase Progress Badge progress
 * - Render Heat Badge progress
 * - Render Food Category Badge progress
 * - Render Celestial Badge
 * - Keep page synced with PJCart sessionStorage
 *
 * Does NOT:
 * - Talk to Square yet
 * - Talk to Supabase yet
 * - Award badges
 * - Process checkout
 * - Render authoritative Square-synced display pricing
 */

(function () {
  'use strict';

  if (!window.PJCart) {
    console.warn('PJCartPage: cart-engine.js must load before cart-page.js');
    return;
  }

  var BADGE_BASE = 'assets/badges/';
  var COMMERCIAL_ENDPOINT = 'https://cdbenwthxhypuuipyjlv.supabase.co/functions/v1/square-commercial-public';


  function syncCommercialPrices() {
    var cart = window.PJCart.read();
    var items = Array.isArray(cart && cart.items) ? cart.items : [];
    var ids = Array.from(new Set(items.map(function (item) {
      return item && item.product_id;
    }).filter(Boolean)));

    if (!ids.length) return;

    fetch(COMMERCIAL_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      credentials: 'omit',
      body: JSON.stringify({ product_ids: ids })
    })
      .then(function (response) {
        return response.json().then(function (data) {
          if (!response.ok) {
            throw new Error(data.error || 'Unable to refresh Square pricing.');
          }
          return data;
        });
      })
      .then(function (data) {
        var byId = {};

        (Array.isArray(data.items) ? data.items : []).forEach(function (item) {
          if (item && item.product_id) byId[item.product_id] = item;
        });

        var latest = window.PJCart.read();
        var changed = false;

        latest.items.forEach(function (item) {
          var state = byId[item.product_id];
          if (!state || state.current !== true || state.available !== true) return;

          var price = Number(state.price);
          if (!Number.isFinite(price)) return;

          price = Math.round(price * 100) / 100;

          if (Number(item.price) !== price) {
            item.price = price;
            changed = true;
          }
        });

        if (changed) {
          window.PJCart.write(latest);
        }
      })
      .catch(function (error) {
        console.warn('PJCartPage: Square pricing refresh failed.', error);
      });
  }

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
    syncCommercialPrices();
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
    renderBadgeSections(summary);
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
              '<button class="pj-cart-page-remove" type="button" data-cart-page-remove="' + esc(item.product_id) + '">🗑 Remove</button>' +
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

  function renderBadgeSections(summary) {
    var badgeProgress = summary.badge_progress || {};
    var unlocked = Array.isArray(badgeProgress.unlocked) ? badgeProgress.unlocked : [];
    var brewing = Array.isArray(badgeProgress.brewing) ? badgeProgress.brewing : [];

    renderBadgeSection({
      cards: unlocked,
      gridId: 'pj-badges-unlocked-grid',
      headerId: 'pj-badges-unlocked-header',
      emptyId: 'pj-badges-unlocked-empty',
      emptyMessage: 'Start your lineup to begin unlocking badges.'
    });

    renderBadgeSection({
      cards: brewing,
      gridId: 'pj-badges-brewing-grid',
      headerId: 'pj-badges-brewing-header',
      emptyId: 'pj-badges-brewing-empty',
      emptyMessage: "You've reached the top tier in every category. Nothing left to prove."
    });
  }

  function renderBadgeSection(config) {
    var gridEl = document.getElementById(config.gridId);
    var headerEl = document.getElementById(config.headerId);
    var emptyEl = document.getElementById(config.emptyId);
    var cards = Array.isArray(config.cards) ? config.cards : [];

    if (!gridEl || !emptyEl) return;

    if (!cards.length) {
      gridEl.innerHTML = '';
      gridEl.style.display = 'none';
      emptyEl.textContent = config.emptyMessage || '';
      emptyEl.style.display = 'block';

      if (headerEl) headerEl.style.display = 'none';

      return;
    }

    if (headerEl) headerEl.style.display = '';
    emptyEl.style.display = 'none';
    gridEl.style.display = '';

    gridEl.innerHTML = cards.map(renderBadgeCard).join('');
  }

  function renderBadgeCard(card) {
    var percent = clampPercent(card.percent || 0);
    var media = renderBadgeMedia(card);

    return (
      '<article class="pj-progress-card" data-badge-type="' + esc(card.type) + '" data-badge-state="' + esc(card.state) + '">' +

        '<div class="pj-progress-img-wrap">' +
          media +
        '</div>' +

        '<div class="pj-progress-content">' +
          '<div class="pj-progress-kicker">' + esc(card.label || 'Badge Progress') + '</div>' +
          '<h2>' + esc(card.name || 'Badge Progress') + '</h2>' +
          '<p>' + esc(card.message || 'Keep building your lineup.') + '</p>' +

          '<div class="pj-progress-bar" aria-label="' + esc(card.name || 'Badge') + ' progress">' +
            '<div class="pj-progress-bar-fill" style="width:' + percent + '%;"></div>' +
          '</div>' +
        '</div>' +

      '</article>'
    );
  }

function renderBadgeMedia(card) {
  if (card && card.image) {
    return (
      '<img class="pj-progress-img" src="' + esc(BADGE_BASE + card.image) + '" alt="' + esc(card.name || 'Badge') + '" ' +
        'loading="lazy" onerror="this.outerHTML=\'<span class=&quot;pj-progress-img-fallback visible&quot; aria-hidden=&quot;true&quot;>Art Pending</span>\'">'
    );
  }

  return '<span class="pj-progress-img-fallback visible" aria-hidden="true">Art Pending</span>';
}

  function clampPercent(value) {
    return Math.max(0, Math.min(100, Math.round(Number(value || 0))));
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
    var btn = document.getElementById('pj-cart-page-checkout');

    if (!summary.items.length || !btn) return;

    btn.disabled = true;
    btn.classList.add('disabled');
    btn.textContent = 'Opening Square Checkout…';

    window.PJCart.startCheckout()
      .catch(function (error) {
        console.error('PJCartPage: checkout failed.', error);
        btn.textContent = 'Checkout Now';
        btn.disabled = false;
        btn.classList.remove('disabled');
        window.alert('Checkout could not be opened. Please try again.');
      });
  }

  document.addEventListener('DOMContentLoaded', init);

  window.PJCartPage = {
    init: init,
    render: render
  };

})();
