/**
 * cart-price-sync.js
 * Pepper Junction — cart display pricing from Square commercial state
 *
 * Square remains the commercial authority. This helper hydrates the PJ cart
 * with the current Square-synchronized price for display and badge math.
 * Final checkout pricing is validated against Square again server-side.
 */
(function () {
  'use strict';

  if (!window.PJCart) return;

  var ENDPOINT =
    'https://cdbenwthxhypuuipyjlv.supabase.co/functions/v1/square-commercial-public';
  var syncing = false;
  var rerun = false;

  function normalizePrice(value) {
    var n = Number(value);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  }

  function syncPrices() {
    if (syncing) {
      rerun = true;
      return;
    }

    var cart = window.PJCart.read();
    var items = Array.isArray(cart && cart.items) ? cart.items : [];
    var ids = Array.from(new Set(items.map(function (item) {
      return item && item.product_id;
    }).filter(Boolean)));

    if (!ids.length) return;

    syncing = true;

    fetch(ENDPOINT, {
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
          if (item && item.product_id) {
            byId[item.product_id] = item;
          }
        });

        var latest = window.PJCart.read();
        var changed = false;

        latest.items.forEach(function (item) {
          var state = byId[item.product_id];
          if (!state || state.current !== true || state.available !== true) return;

          var price = normalizePrice(state.price);
          if (price === null) return;

          if (Number(item.price) !== price || item.price_source !== 'square-commercial') {
            item.price = price;
            item.price_source = 'square-commercial';
            changed = true;
          }
        });

        if (changed) {
          window.PJCart.write(latest);
        }
      })
      .catch(function (error) {
        console.warn('PJCart price sync failed.', error);
      })
      .finally(function () {
        syncing = false;
        if (rerun) {
          rerun = false;
          setTimeout(syncPrices, 0);
        }
      });
  }

  var originalAddItem = window.PJCart.addItem;

  window.PJCart.addItem = function () {
    var result = originalAddItem.apply(window.PJCart, arguments);
    setTimeout(syncPrices, 0);
    return result;
  };

  syncPrices();

  window.PJCartPriceSync = {
    refresh: syncPrices
  };
})();
