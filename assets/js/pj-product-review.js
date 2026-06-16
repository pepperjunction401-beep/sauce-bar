/**

* pj-product-review.js
* Pepper Junction — Shared Product-Page Review Integration v1 (Prototype)
*
* Owns on the product page:
* * Review button binding
* * Passenger Reviews section creation and placement
* * People's Choice Rating summary display
* * Approved customer-line display (left-side scroll)
*
* Does NOT own:
* * Questionnaire wording, scoring, or submission
* * Authentication, purchase verification, or eligibility logic
* * Moderation, badge thresholds, or aggregate math
* * Direct Supabase or Square access
*
* Phase 3 prototype: ships with mock data. Phase 6 swaps in live calls.
* Fails silently. If anything is missing, the product page must remain usable.
  */

(function () {
'use strict';

/* ── CONFIG ─────────────────────────────────────────────── */
var SHARED_REVIEW_PAGE = '../review.html';
var TWO_OR_MORE_SYMBOLS = /[!@#$%^&*()_+={}[]|\:;"'<>,.?/~`]{2,}/;

var state = {
productSlug: null,
reviewButtonId: null,
customerLineId: null,
lineShown: false,
customerLinePool: [],
dismissTimer: null
};

/* ── INIT ───────────────────────────────────────────────── */
function init(opts) {
if (!opts || !opts.productSlug) {
console.warn('PJProductReview: init requires productSlug.');
return;
}

```
state.productSlug = opts.productSlug;
state.reviewButtonId = opts.reviewButtonId || 'pj-review';
state.customerLineId = opts.customerLineId || 'customer-line';

createPassengerReviewsSection();
bindReviewButton();
loadSummary();
prefetchCustomerLines();
bindCustomerLineDismissal();
```

}

/* ══════════════════════════════════════════════════════════
PASSENGER REVIEWS SECTION
Created and positioned here so all connected product pages
can be moved or updated together from this one shared file.
══════════════════════════════════════════════════════════ */
function createPassengerReviewsSection() {
var existingSection = document.getElementById(
'passenger-reviews-section'
);

```
if (existingSection) {
  return existingSection;
}

/*
 * Remove an older hardwired summary container if a product
 * page still contains one.
 */
var oldSummary = document.getElementById('pj-peoples-choice');

if (oldSummary) {
  oldSummary.remove();
}

/*
 * The Passenger Reviews section is currently inserted after
 * the product classification block and before "What It Is."
 *
 * Changing this anchor later will move the section across
 * every connected product page.
 */
var anchor = document.querySelector('.product-title-block');

if (!anchor || !anchor.parentNode) {
  return null;
}

var section = document.createElement('div');
section.className = 'editorial passenger-reviews-section';
section.id = 'passenger-reviews-section';
section.hidden = true;

var label = document.createElement('div');
label.className = 'section-label';
label.textContent = 'Passenger Reviews';

var summary = document.createElement('div');
summary.className = 'pj-peoples-choice';
summary.id = 'pj-peoples-choice';
summary.hidden = true;
summary.setAttribute('aria-live', 'polite');

var stars = document.createElement('span');
stars.className = 'pj-peoples-choice-stars';
stars.id = 'pj-peoples-choice-stars';

var value = document.createElement('span');
value.className = 'pj-peoples-choice-value';
value.id = 'pj-peoples-choice-value';

var count = document.createElement('span');
count.className = 'pj-peoples-choice-count';
count.id = 'pj-peoples-choice-count';

summary.appendChild(stars);
summary.appendChild(value);
summary.appendChild(count);

section.appendChild(label);
section.appendChild(summary);

anchor.insertAdjacentElement('afterend', section);

return section;
```

}

/* ══════════════════════════════════════════════════════════
REVIEW BUTTON
══════════════════════════════════════════════════════════ */
function bindReviewButton() {
var btn = document.getElementById(state.reviewButtonId);

```
if (!btn) {
  return;
}

/*
 * Enable the button only after this shared system
 * initializes successfully.
 */
btn.disabled = false;
btn.setAttribute('aria-disabled', 'false');

btn.addEventListener('click', handleReviewClick);
```

}

function handleReviewClick() {
/*
* Phase 6 will replace this prototype routing with:
*
* 1. Determine whether the customer is signed in.
* 2. Require sign-in when necessary.
* 3. Verify an eligible Square purchase.
* 4. Confirm the customer has not already reviewed the item.
* 5. Open the shared review page for this product.
*
* Authentication, Square, and Supabase eligibility checks
* are not connected in this prototype.
*/
var url =
SHARED_REVIEW_PAGE +
'?product=' +
encodeURIComponent(state.productSlug);

```
window.location.href = url;
```

}

/* ══════════════════════════════════════════════════════════
PEOPLE'S CHOICE RATING SUMMARY
══════════════════════════════════════════════════════════ */
function loadSummary() {
/*
* Phase 6 will fetch the approved aggregate from Supabase.
*
* Prototype expected shape:
*
* {
*   rating: 4.25,
*   count: 38
* }
*
* Until live aggregate data exists, the entire Passenger
* Reviews section remains hidden.
*/
var aggregate = getMockAggregate(state.productSlug);

```
if (!aggregate || !aggregate.count) {
  return;
}

renderSummary(aggregate);
```

}

function renderSummary(aggregate) {
var section = document.getElementById(
'passenger-reviews-section'
);

```
var container = document.getElementById(
  'pj-peoples-choice'
);

if (!container) {
  return;
}

var starsEl = document.getElementById(
  'pj-peoples-choice-stars'
);

var valueEl = document.getElementById(
  'pj-peoples-choice-value'
);

var countEl = document.getElementById(
  'pj-peoples-choice-count'
);

if (starsEl) {
  starsEl.textContent = buildStars(aggregate.rating);
}

if (valueEl) {
  valueEl.textContent =
    aggregate.rating.toFixed(2) +
    ' People\u2019s Choice';
}

if (countEl) {
  countEl.textContent =
    '(' +
    aggregate.count +
    ' verified review' +
    (aggregate.count === 1 ? '' : 's') +
    ')';
}

if (section) {
  section.hidden = false;
}

container.hidden = false;
```

}

function buildStars(rating) {
var full = Math.floor(rating);
var fraction = rating - full;
var stars = '';

```
for (var i = 0; i < full; i++) {
  stars += '\u2605';
}

if (fraction >= 0.75) {
  stars += '\u2605';
} else if (fraction >= 0.5) {
  stars += '\u00BD';
} else if (fraction >= 0.25) {
  stars += '\u00BC';
}

while (
  stars.replace(/[\u00BC\u00BD]/g, '').length +
    (
      stars.indexOf('\u00BC') > -1 ||
      stars.indexOf('\u00BD') > -1
        ? 1
        : 0
    ) <
  5
) {
  stars += '\u2606';
}

return stars;
```

}

/* ══════════════════════════════════════════════════════════
CUSTOMER LINE
══════════════════════════════════════════════════════════ */
function prefetchCustomerLines() {
/*
* Phase 6 will fetch approved customer lines from a
* restricted public Supabase view.
*
* The response should contain only:
*
* - Customer-line text
* - Customer first name
* - Current Railroad Passenger class
* - Product slug
* - Prompt type
*
* The prototype pool remains empty. Therefore, no customer
* scroll appears until approved live data exists.
*/
state.customerLinePool = getMockCustomerLines(
state.productSlug
);
}

function showCustomerLine() {
if (state.lineShown) {
return;
}

```
var pool = state.customerLinePool.filter(isLineSafe);

/*
 * No approved line means nothing appears.
 * No empty box and no visible error should be shown.
 */
if (!pool.length) {
  return;
}

var randomIndex = Math.floor(
  Math.random() * pool.length
);

var line = pool[randomIndex];

var container = document.getElementById(
  state.customerLineId
);

if (!container) {
  return;
}

var textEl = document.getElementById(
  'customer-line-text'
);

var attrEl = document.getElementById(
  'customer-line-attr'
);

/*
 * Customer content must always be inserted through
 * textContent rather than innerHTML.
 */
if (textEl) {
  textEl.textContent = line.text || '';
}

if (attrEl) {
  attrEl.textContent =
    '\u2014 ' +
    (line.firstName || '') +
    ', ' +
    (line.passengerClass || '');
}

container.classList.add('visible');
state.lineShown = true;

/*
 * Remain visible for 15 seconds, mirroring the existing
 * bartender-scroll duration.
 */
if (state.dismissTimer) {
  clearTimeout(state.dismissTimer);
}

state.dismissTimer = setTimeout(
  hideCustomerLine,
  15000
);
```

}

function hideCustomerLine() {
var container = document.getElementById(
state.customerLineId
);

```
if (container) {
  container.classList.remove('visible');
}

if (state.dismissTimer) {
  clearTimeout(state.dismissTimer);
  state.dismissTimer = null;
}
```

}

function isLineSafe(line) {
if (!line || !line.text) {
return false;
}

```
/*
 * Reject runs of two or more adjacent symbols.
 */
if (TWO_OR_MORE_SYMBOLS.test(line.text)) {
  return false;
}

return true;
```

}

function bindCustomerLineDismissal() {
var container = document.getElementById(
state.customerLineId
);

```
if (!container) {
  return;
}

/*
 * Tap to dismiss.
 */
container.addEventListener(
  'click',
  hideCustomerLine
);

/*
 * Swipe toward the left to dismiss.
 */
var touchStartX = 0;

container.addEventListener(
  'touchstart',
  function (event) {
    touchStartX = event.touches[0].clientX;
  },
  { passive: true }
);

container.addEventListener(
  'touchend',
  function (event) {
    var difference =
      event.changedTouches[0].clientX -
      touchStartX;

    if (difference < -40) {
      hideCustomerLine();
    }
  },
  { passive: true }
);
```

}

/* ══════════════════════════════════════════════════════════
MOCK DATA — PROTOTYPE ONLY
Replace with live Supabase requests during Phase 6.
══════════════════════════════════════════════════════════ */
function getMockAggregate() {
/*
* Return null until approved aggregate data is connected.
*/
return null;
}

function getMockCustomerLines() {
/*
* Return an empty array until approved customer-line data
* is connected.
*/
return [];
}

/* ══════════════════════════════════════════════════════════
PUBLIC API
══════════════════════════════════════════════════════════ */
window.PJProductReview = {
init: init,
showCustomerLine: showCustomerLine,
hideCustomerLine: hideCustomerLine
};
})();
