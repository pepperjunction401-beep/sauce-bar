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
var TWO_OR_MORE_SYMBOLS = /[!@#$%^&*()_+={}\[\]|\\:;"'<>,.?~`\/]{2,}/;

/*
 * Phase 1 prototype gate: mock review data activates ONLY
 * when the page URL carries ?pjmock=1. Without it, mocks
 * return null/empty exactly as before, so live product
 * pages are completely unaffected during the build.
 */
var MOCK_ENABLED = /[?&]pjmock=1/.test(window.location.search);

var state = {
productSlug: null,
reviewButtonId: null,
customerLineId: null,
lineShown: false,
customerLinePool: [],
dismissTimer: null,
/* Phase 1 — Passenger Reviews display */
publicReviews: [],
totalReviewCount: 0,
viewMode: 'compact'
};

/* ── INIT ───────────────────────────────────────────────── */
function init(opts) {
if (!opts || !opts.productSlug) {
console.warn('PJProductReview: init requires productSlug.');
return;
}

state.productSlug = opts.productSlug;
state.reviewButtonId = opts.reviewButtonId || 'pj-review';
state.customerLineId = opts.customerLineId || 'customer-line';

createPassengerReviewsSection();
bindReviewButton();
loadSummary();
initReviewDisplay();
prefetchCustomerLines();
bindCustomerLineDismissal();

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
section.hidden = false;

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

}

/* ══════════════════════════════════════════════════════════
REVIEW BUTTON
══════════════════════════════════════════════════════════ */
function bindReviewButton() {
var btn = document.getElementById(state.reviewButtonId);

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

window.location.href = url;

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

if (!aggregate || !aggregate.count) {
  return;
}

renderSummary(aggregate);

}

function renderSummary(aggregate) {
var section = document.getElementById(
'passenger-reviews-section'
);

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
  /*
   * starsEl is the only element where innerHTML is used,
   * because the star markup is generated entirely by
   * buildStars() below. No external input touches it.
   */
  starsEl.innerHTML = buildStars(aggregate.rating);
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

}

function buildStars(rating) {
  /*
   * Accurate quarter-star renderer using layered fill.
   * Renders 5 empty stars (☆☆☆☆☆) with a width-clipped
   * overlay of 5 filled stars (★★★★★). The fill width is
   * (rating / 5) * 100%, which gives precise fractional
   * display at any rating — not just .00/.25/.50/.75.
   *
   * A rating of 3.75 renders as 75% of the row filled,
   * not as 4 full stars.
   */
  var clamped = Math.max(0, Math.min(5, Number(rating) || 0));
  var pct = (clamped / 5) * 100;
  return (
    '<span class="pj-stars-wrap" aria-hidden="true">' +
      '<span class="pj-stars-empty">\u2606\u2606\u2606\u2606\u2606</span>' +
      '<span class="pj-stars-fill" style="width:' + pct + '%;">\u2605\u2605\u2605\u2605\u2605</span>' +
    '</span>'
  );
}

/* ══════════════════════════════════════════════════════════
PASSENGER REVIEWS DISPLAY — PHASE 1 EXPANSION
State flow: Compact → 3-Review Preview → All Reviews → Compact.
Show Less always returns to Compact.

Privacy rule: this display receives ONLY public data —
review text, first name, passenger class, aggregate, count.
Phase 6 swaps the mock provider for a restricted Supabase
view; nothing here requires redesign for that swap.
══════════════════════════════════════════════════════════ */
function initReviewDisplay() {
var data = getMockReviewData(state.productSlug);

/*
 * Zero-review state: with no approved public reviews the
 * section simply carries no Expand control and no list —
 * the existing hide-when-no-aggregate behavior keeps the
 * page clean and intentional. No broken controls appear.
 */
if (!data || !data.reviews || !data.reviews.length) {
  return;
}

state.publicReviews = data.reviews.filter(isLineSafe);
state.totalReviewCount = data.count || state.publicReviews.length;

if (!state.publicReviews.length) {
  return;
}

buildReviewDisplayScaffold();
setViewMode('compact');

}

function buildReviewDisplayScaffold() {
var section = document.getElementById(
'passenger-reviews-section'
);

if (!section || document.getElementById('pj-review-display')) {
  return;
}

var wrap = document.createElement('div');
wrap.id = 'pj-review-display';
wrap.className = 'pj-review-display';

var list = document.createElement('div');
list.id = 'pj-review-list';
list.className = 'pj-review-list';
list.setAttribute('aria-live', 'polite');

var controls = document.createElement('div');
controls.id = 'pj-review-controls';
controls.className = 'pj-review-controls';

wrap.appendChild(list);
wrap.appendChild(controls);
section.appendChild(wrap);

}

function makeReviewControl(labelText, onClick) {
var b = document.createElement('button');
b.type = 'button';
b.className = 'pj-review-control';
b.textContent = labelText;
b.addEventListener('click', onClick);
return b;
}

function setViewMode(mode) {
state.viewMode = mode;

var list = document.getElementById('pj-review-list');
var controls = document.getElementById('pj-review-controls');

if (!list || !controls) {
  return;
}

/*
 * Rebuild list and controls for the requested state.
 * All customer content is inserted via textContent only.
 */
list.textContent = '';
controls.textContent = '';

var total = state.totalReviewCount;

if (mode === 'compact') {
  controls.appendChild(
    makeReviewControl('Expand', function () {
      setViewMode('preview');
    })
  );
  return;
}

var toShow =
  mode === 'preview'
    ? state.publicReviews.slice(0, 3)
    : state.publicReviews;

toShow.forEach(function (review) {
  list.appendChild(renderReviewItem(review));
});

controls.appendChild(
  makeReviewControl('Show Less', function () {
    setViewMode('compact');
    scrollReviewSectionIntoView();
  })
);

/*
 * View All only appears in preview, and only when there
 * is genuinely more to see — no meaningless controls.
 */
if (mode === 'preview' && state.publicReviews.length > 3) {
  controls.appendChild(
    makeReviewControl(
      'View All ' + total + ' Reviews',
      function () {
        setViewMode('all');
      }
    )
  );
}

}

function renderReviewItem(review) {
var item = document.createElement('figure');
item.className = 'pj-review-item';

var quote = document.createElement('blockquote');
quote.className = 'pj-review-quote';
quote.textContent = '\u201C' + (review.text || '') + '\u201D';

var attr = document.createElement('figcaption');
attr.className = 'pj-review-attr';
attr.textContent =
  '\u2014 ' +
  (review.firstName || '') +
  ', ' +
  (review.passengerClass || '');

item.appendChild(quote);
item.appendChild(attr);

return item;

}

function scrollReviewSectionIntoView() {
var section = document.getElementById(
'passenger-reviews-section'
);

if (!section) {
  return;
}

var reduced =
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

section.scrollIntoView({
  behavior: reduced ? 'auto' : 'smooth',
  block: 'start'
});

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

}

function hideCustomerLine() {
var container = document.getElementById(
state.customerLineId
);

if (container) {
  container.classList.remove('visible');
}

if (state.dismissTimer) {
  clearTimeout(state.dismissTimer);
  state.dismissTimer = null;
}

}

function isLineSafe(line) {
if (!line || !line.text) {
return false;
}

/*
 * Reject runs of two or more adjacent symbols.
 */
if (TWO_OR_MORE_SYMBOLS.test(line.text)) {
  return false;
}

return true;

}

function bindCustomerLineDismissal() {
var container = document.getElementById(
state.customerLineId
);

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

}

/* ══════════════════════════════════════════════════════════
MOCK DATA — PROTOTYPE ONLY
Replace with live Supabase requests during Phase 6.
Mock data activates ONLY with ?pjmock=1 in the URL.
Without the flag, every provider returns null/empty and
live product pages behave exactly as before Phase 1.

Public-display fields only: text, firstName, passengerClass.
No customer IDs, no questionnaire data, nothing private.
══════════════════════════════════════════════════════════ */
var MOCK_REVIEW_DATA = {
'2-pig-mafia-steak-seasoning-14oz': {
rating: 4.75,
reviews: [
{ text: 'Perfect balance of smoke and heat. This has retired every other steak rub in my cabinet.', firstName: 'Melissa', passengerClass: 'Dining Car Regular' },
{ text: 'Absolutely killer on ribeyes and grilled chicken. The crust it builds is unreal.', firstName: 'John', passengerClass: 'Day Coach Passenger' },
{ text: 'Great flavor up front before the warmth rolls in. Staying in the rotation for good.', firstName: 'Sarah', passengerClass: 'Parlor Car Passenger' },
{ text: 'Rubbed it on pork chops for Sunday dinner and the table went quiet. That kind of good.', firstName: 'Marcus', passengerClass: 'Sleeper Car Passenger' },
{ text: 'My brisket finally tastes like the one I brag about. Worth every penny.', firstName: 'Dana', passengerClass: 'Day Coach Passenger' },
{ text: 'Even works on roasted potatoes and corn. It left the steak station a long time ago.', firstName: 'Priya', passengerClass: 'Dining Car Regular' },
{ text: 'Bought one for my father-in-law and had to go back for my own. Lesson learned.', firstName: 'Tom', passengerClass: 'Caboose Rider' }
]
},
'high-river-sauces-tears-of-the-sun': {
rating: 4.5,
reviews: [
{ text: 'Bright citrus first, then the burn shows up fashionably late. Beautiful on fish tacos.', firstName: 'Elena', passengerClass: 'Parlor Car Passenger' },
{ text: 'The heat is honest and the flavor never quits. My eggs demand it now.', firstName: 'Ray', passengerClass: 'Day Coach Passenger' },
{ text: 'Sweet, sharp, and sneaky. One of the best balanced bottles on my shelf.', firstName: 'Kim', passengerClass: 'Dining Car Regular' }
]
},
'mikey-vs-reaper-jalapeno-dill-pickle': {
rating: 4.25,
reviews: [
{ text: 'Pickle brine and reaper heat should not work together. They absolutely do.', firstName: 'Chris', passengerClass: 'Day Coach Passenger' },
{ text: 'Put this on a burger and briefly saw through time. Ten out of ten.', firstName: 'Ashley', passengerClass: 'Caboose Rider' }
]
},
'13-stars-dragons-breath': {
rating: 4.0,
reviews: [
{ text: 'Mild enough for the whole family, flavorful enough that nobody noticed it was mild.', firstName: 'Grace', passengerClass: 'Parlor Car Passenger' }
]
}
};

function getMockReviewData(slug) {
/*
 * Return null unless the ?pjmock=1 development gate is on.
 */
if (!MOCK_ENABLED) {
  return null;
}

var data = MOCK_REVIEW_DATA[slug];

if (!data) {
  return null;
}

return {
  rating: data.rating,
  count: data.reviews.length,
  reviews: data.reviews.slice()
};

}

function getMockAggregate(slug) {
/*
* Return null until approved aggregate data is connected.
* With ?pjmock=1, derive the aggregate from the mock
* review pool so summary and list always agree.
*/
var data = getMockReviewData(slug);

if (!data) {
  return null;
}

return { rating: data.rating, count: data.count };

}

function getMockCustomerLines(slug) {
/*
* Return an empty array until approved customer-line data
* is connected. With ?pjmock=1, the customer-line pool is
* the same approved public review pool — per the rules,
* lines come from approved "What do you love about this
* sauce?" responses for the current product.
*/
var data = getMockReviewData(slug);

if (!data) {
  return [];
}

return data.reviews.slice();

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
