/* Pepper Junction Review Board → Cart, Sauce-Bar-Dev LOCAL TESTING ONLY.
 * The reward never enters PJCart.items, subtotal, or badge progress.
 * Server-authoritative row entitlement controls Sandbox checkout.
 * No Production checkout or frozen Loyalty Bridge modifications.
 */
(function () {
  'use strict';

  function isLocal() {
    var host = window.location.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1';
  }
  if (!isLocal()) return;

  var query = new URLSearchParams(window.location.search);
  var rawRow = query.get('reviewRewardRow');
  var savedRow = null;
  try { savedRow = sessionStorage.getItem('pj_review_cart_row'); } catch (_) {}
  var pending = window.PJCart && window.PJCart.getReviewRewardCheckoutPending
    ? window.PJCart.getReviewRewardCheckoutPending() : null;
  var rowNumber = rawRow && /^[1-9][0-9]*$/.test(rawRow) ? Number(rawRow)
    : pending && Number.isInteger(pending.row_number) ? pending.row_number
    : savedRow && /^[1-9][0-9]*$/.test(savedRow) ? Number(savedRow) : null;
  if (rowNumber) {
    try { sessionStorage.setItem('pj_review_cart_row', String(rowNumber)); } catch (_) {}
  }
  if (!rowNumber) return;

  var cart = window.PJCart;
  var review = window.PJReviewData;
  var normalCheckout = document.getElementById('pj-cart-page-checkout');
  var summaryBox = document.querySelector('.pj-cart-page-summary-box');
  if (!cart || !normalCheckout || !summaryBox) return;

  var section = document.createElement('section');
  section.id = 'pj-review-cart-reward';
  section.setAttribute('aria-label', 'Review Board complimentary selection');
  section.style.cssText = 'margin:14px 0;padding:14px;border:1px solid #d8b45d;border-radius:8px;background:#203522;color:#f5e6c8;';
  var heading = document.createElement('strong');
  heading.textContent = 'Review Board — Complimentary Selection';
  heading.style.display = 'block';
  var details = document.createElement('p');
  details.setAttribute('role', 'status');
  details.style.cssText = 'margin:8px 0;line-height:1.5;';
  details.textContent = 'Checking your earned reward in Supabase Testing…';
  var redeem = document.createElement('button');
  redeem.type = 'button';
  redeem.className = 'pj-cart-page-checkout';
  redeem.style.cssText = 'display:none;margin:8px 0;width:100%;';
  var returnLink = document.createElement('a');
  returnLink.href = 'passenger-station.html';
  returnLink.textContent = 'Return to Review Board';
  returnLink.style.cssText = 'display:inline-block;color:#f1cc78;margin-top:8px;';
  section.appendChild(heading);
  section.appendChild(details);
  section.appendChild(redeem);
  section.appendChild(returnLink);
  summaryBox.insertBefore(section, normalCheckout);
  // The original paid checkout must never silently omit a selected reward.
  normalCheckout.hidden = true;
  normalCheckout.disabled = true;
  normalCheckout.setAttribute('aria-hidden', 'true');
  function restoreRegularCheckout() {
    try { sessionStorage.removeItem('pj_review_cart_row'); } catch (_) {}
    normalCheckout.hidden = false;
    normalCheckout.removeAttribute('aria-hidden');
    normalCheckout.disabled = cart.getSummary().item_count === 0;
  }

  function selectedRow(rows) {
    return Array.isArray(rows) ? rows.find(function (row) {
      return row && row.rowNumber === rowNumber;
    }) : null;
  }
  function eligible(row) {
    return row && row.achieved === true && row.entitlementStatus === 'selected' &&
      typeof row.selectedProductSlug === 'string' && !!row.selectedProductSlug;
  }
  var serverRow = null;
  var busy = false;

  function refreshControl() {
    var summary = cart.getSummary();
    var existing = cart.getReviewRewardCheckoutPending();
    var hasPaid = Array.isArray(summary.items) && summary.items.length > 0;
    if (!eligible(serverRow)) {
      redeem.style.display = 'none';
      return;
    }
    if (existing && existing.row_number !== rowNumber) {
      details.textContent = 'Another Review Board reward has an outstanding Sandbox checkout. Confirm that order before opening a new one.';
      redeem.style.display = 'none';
      return;
    }
    var product = serverRow.selectedProductSlug.replace(/-/g, ' ');
    details.textContent = 'Saved complimentary selection: ' + product +
      '. The free item is added by Square Sandbox at $0.00, not as a paid cart line.' +
      (existing ? ' Verify your earlier Sandbox payment below.' :
      hasPaid ? ' Your paid cart items remain unchanged.' :
      ' Add at least one paid item to the cart to redeem it.');
    redeem.style.display = 'block';
    redeem.disabled = busy || (!existing && !hasPaid);
    redeem.textContent = existing ? 'Verify Square Sandbox Payment' :
      'Checkout with Reward (Square Sandbox)';
  }

  if (!review || typeof review.getReviewBoard !== 'function') {
    details.textContent = 'Supabase Testing review verification is unavailable. No checkout has been opened.';
    return;
  }
  review.getReviewBoard().then(function (result) {
    serverRow = selectedRow(result && result.rows);
    if (!serverRow || serverRow.achieved !== true) {
      details.textContent = 'No completed Review Board row was verified for this account.';
      return;
    }
    if (serverRow.entitlementStatus === 'redeemed') {
      details.textContent = 'This row reward has already been redeemed. Your earned achievement remains.';
      restoreRegularCheckout();
      return;
    }
    if (!eligible(serverRow)) {
      details.textContent = 'Choose an available complimentary product on the Review Board first.';
      return;
    }
    refreshControl();
  }).catch(function () {
    details.textContent = 'Unable to verify your Review Board reward. Checkout is locked until verification succeeds.';
  });

  window.addEventListener(cart.event, refreshControl);
  redeem.addEventListener('click', function () {
    if (busy || !eligible(serverRow)) return;
    var existing = cart.getReviewRewardCheckoutPending();
    if (existing && existing.row_number !== rowNumber) return;
    if (!existing && !(cart.getSummary().items || []).length) return;
    busy = true;
    redeem.disabled = true;
    redeem.textContent = 'Contacting Square Sandbox…';
    var task = existing ? cart.verifyReviewRewardSandboxPayment()
      : cart.startReviewRewardCheckout(rowNumber);
    Promise.resolve(task).then(function () {
      if (existing) {
        details.textContent = 'Square Sandbox payment verified. Complimentary reward redeemed once.';
        redeem.style.display = 'none';
        serverRow.entitlementStatus = 'redeemed';
        restoreRegularCheckout();
      }
      // New checkout redirects to Square in PJCart; cart stays intact until return.
    }).catch(function (error) {
      details.textContent = error && error.message ? error.message :
        'Square Sandbox checkout is unavailable. Your paid cart and reward remain unchanged.';
    }).finally(function () {
      busy = false;
      refreshControl();
    });
  });
})();
