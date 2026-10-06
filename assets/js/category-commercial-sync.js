/**
 * category-commercial-sync.js
 * Pepper Junction — category-card commercial state
 *
 * Product identity comes from the page/CNS slug. Display price and stock state
 * come from the trusted Supabase mirror of Square. Checkout still revalidates
 * directly against Square before payment.
 */
(function () {
  'use strict';

  var ENDPOINT =
    'https://cdbenwthxhypuuipyjlv.supabase.co/functions/v1/square-commercial-public';
  var scheduled = false;
  var syncing = false;
  var rerun = false;

  function slugFromCard(card) {
    var href = card && card.getAttribute('href');
    if (!href) return '';
    var match = href.match(/products\/([^\/?#]+)\.html(?:[?#].*)?$/);
    return match ? match[1] : '';
  }

  function ensureStyle() {
    if (document.getElementById('pj-category-commercial-style')) return;

    var style = document.createElement('style');
    style.id = 'pj-category-commercial-style';
    style.textContent =
      '.product-card.out-of-stock .product-card-image{position:relative;overflow:hidden;}' +
      '.product-card.out-of-stock .out-of-stock-banner{' +
      'position:absolute;left:0;right:0;bottom:0;z-index:6;' +
      'display:flex;align-items:center;justify-content:center;' +
      'min-height:34px;background:#8F1F0D;border-top:2px solid #D4A832;' +
      'color:#FFD700;font-family:Josefin Sans,sans-serif;font-size:11px;' +
      'font-weight:700;letter-spacing:.22em;text-transform:uppercase;transform:none!important;}' +
      '.product-card.out-of-stock .product-card-btn{opacity:.65;}';
    document.head.appendChild(style);
  }

  function setOutOfStock(card, isOut) {
    card.classList.toggle('out-of-stock', isOut);

    var imageWrap = card.querySelector('.product-card-image');
    if (!imageWrap) return;

    var banner = imageWrap.querySelector('.out-of-stock-banner');

    if (isOut && !banner) {
      banner = document.createElement('div');
      banner.className = 'out-of-stock-banner';
      banner.innerHTML = '<span>Out of Stock</span>';
      imageWrap.appendChild(banner);
    }

    if (!isOut && banner) {
      banner.remove();
    }
  }

  function setPrice(card, price) {
    var el = card.querySelector('.product-card-price');
    if (!el || !Number.isFinite(Number(price))) return;

    var display = '$' + Number(price).toFixed(2);
    var current = el.textContent || '';

    if (/\$[0-9,.]+/.test(current)) {
      el.textContent = current.replace(/\$[0-9,.]+/, display);
    } else if (current.trim()) {
      el.textContent = current.trim() + ' · ' + display;
    } else {
      el.textContent = display;
    }
  }

  function syncNow() {
    if (syncing) {
      rerun = true;
      return;
    }

    var cards = Array.prototype.slice.call(
      document.querySelectorAll('a.product-card[href*="products/"]')
    );

    var slugs = Array.from(new Set(cards.map(slugFromCard).filter(Boolean)));
    if (!slugs.length) return;

    syncing = true;

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      credentials: 'omit',
      body: JSON.stringify({ product_ids: slugs })
    })
      .then(function (response) {
        return response.json().then(function (data) {
          if (!response.ok) {
            throw new Error(data.error || 'Unable to refresh category commercial state.');
          }
          return data;
        });
      })
      .then(function (data) {
        var byId = {};

        (Array.isArray(data.items) ? data.items : []).forEach(function (item) {
          if (item && item.product_id) byId[item.product_id] = item;
        });

        cards.forEach(function (card) {
          var slug = slugFromCard(card);
          var state = byId[slug];
          if (!state || state.current !== true) return;

          setPrice(card, state.price);
          setOutOfStock(card, state.available !== true);
        });
      })
      .catch(function (error) {
        console.warn('PJ category commercial sync failed.', error);
      })
      .finally(function () {
        syncing = false;
        if (rerun) {
          rerun = false;
          scheduleSync();
        }
      });
  }

  function scheduleSync() {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(function () {
      scheduled = false;
      syncNow();
    }, 50);
  }

  function observeGrids() {
    document.querySelectorAll('.product-grid').forEach(function (grid) {
      var observer = new MutationObserver(scheduleSync);
      observer.observe(grid, { childList: true });
    });
  }

  function init() {
    ensureStyle();
    observeGrids();
    syncNow();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();