# G9 — Test 4: Cross-family badge compatibility, responsive layout, account routing, cart guards

**Date:** November 7, 2026.  
**Result:** **PASS — 10/10 isolated Chromium checks.**  
**Scope:** GitHub `Sauce-Bar-Dev` actual HTML/CSS/JS in Chromium; in-memory synthetic Auth and award responses. Supabase Testing checked read-only for residue. No Production/Square/Netlify traffic; no Auth creation, migrations, or badge writes.

## Test evidence

[Passing GitHub Actions run 42348803741](https://github.com/pepperjunction401-beep/sauce-bar/actions/runs/42348803741)  
Test code: `tools/g9-state-badges/tests/verify-test4-cross-family-responsive.mjs`  
Workflow: `.github/workflows/g9-test4-cross-family-responsive.yml`.

The isolated Chromium server serves the **real Dev files**, not a rewritten UI. Third-party HTTP/Supabase requests are blocked, and the official checkout-confirmation URL is **intercepted locally** with controlled fake confirmation responses. Real customer accounts and Production data are never accessed. This is a browser **presentation/guard regression**, not proof of the backend awarding each other family; that belongs to the respective established family engine tests.

### Post-Payment Awards: 4/4 viewports PASS

At **320×700, 390×844, 768×1024, and 1440×900**, an authenticated, same-checkout synthetic response with eight distinct award families was projected through the existing production-equivalent generic/art adapter and layout:

- Heat Identity, Food, Purchase Progress, Celestial, Shop O'Round, eligible Bottle Coin, **G9 State Entry**, and **earned G9 State Division Secret**.
- Eight unique earned cards with preserved family identifiers and artwork mapping.
- Food and Purchase Progress *Badge in Your Grasp* progress supplied from synthetic verified server fields; Food milestones displayed and Purchase Progress meter displayed without an aggregate dollars total.
- No document-level horizontal overflow at any tested size; first card stayed within viewport.
- Keyboard `Enter` flips an earned card.
- No retry control when the G9 result is complete.
- Nine division-secret artwork assets have not been approved/created; the awarded-only fallback is text/★.

### Passenger Station Badge Depot: 2/2 viewports PASS

At **390×844 and 1440×900**, actual `passenger-station.html` embedded Depot and its existing presentation adapters consumed a controlled synthetic family collection. Earned/active appearance remained in place for:

- Heat Identity, Food, Bottle Coin, Purchase Progress, Shop O'Round **×2** count bubble, Celestial (October 2026), Passenger Token, Milestone, and **G9 Rhode Island Level 2**.
- Connecticut remained locked; unearned State division secrets stayed completely absent.
- Loyalty Bridge stayed in its prelaunch/locked condition; no PJ Credits calculation or exchange was invoked.

**Important limit:** Passenger Tokens and Milestone are Depot-only in this post-payment server reader because that reader has not proven purchase-specific attribution for them. This test did not invent a checkout attribution nor claim they appear in the celebration.

### Account navigation: 1/1 PASS

Real Dev `account.html` with simulated already-signed-in verified identity:

- `?return=post-payment` Continue navigates to the existing `post-payment-badges.html`.
- `?return=station` Continue navigates to existing `passenger-station.html`; the latter may append a section hash. Tests assert pathname rather than an exact hash-free URL.
- No changes to identity matcher or Supabase Auth. The underlying session was **synthetic**, so this is client routing validation, not a new real-session or full login/persistence claim.

### Payment/cart guard: 3/3 PASS

Real Dev `post-payment-badges.html` loads existing `post-payment-cart-clear.js`, with its Production-confirmation endpoint **intercepted and never contacted**:

1. **Not confirmed** → retain pending checkout and cart; no cart-updated event.
2. **Confirmed, unchanged cart** → clear exact original cart and pending checkout; emit one cart-updated event.
3. **Confirmed, customer edited cart** → preserve edited cart; clear only the now-confirmed pending checkout; no cart-updated event.

No Square verification or purchase confirmation was performed in these tests. No G9 change to cart behavior.

## Test-run correction

First run `42348713071` passed 9/10 but its station URL assertion rejected the **legitimate `#depot` fragment**. The test-only assertion was corrected to compare the pathname; no application file changed. Final rerun `42348803741` passed 10/10.

## Clean isolated Testing baseline

After the browser runs, isolated Supabase Testing was checked:

| Record | Current count |
|---|---:|
| Auth users | 2 (original baseline) |
| Customer profiles | 2 (original baseline) |
| Purchases | 0 |
| G9 queue / credits / levels / secrets | 0 / 0 / 0 / 0 |
| Passenger reconciliation queue | 0 |
| Heat / Food / Round Clock / Celestial / Milestone award rows | 0 |

No production files, Main, Production Supabase, Square, importer, Railroad, worker, reward rules, or live customer data was modified. New files were confined to tests/workflows/report on Dev.

## Scope outstanding

Test 4 establishes the **browser compatibility, expected family artwork mapping, responsive layout, account navigation, and cart safeguards** with controlled input. It does **not** certify real paid events for all the other families or live Auth persistence across production navigation; those require family-specific integration and the separately authorized final live checkout.

**Next:** Test 5 of 7 — deployed isolated Testing endpoint abuse/ownership, malformed and unpaid orders, unauthenticated/expired-session controls, and origin/row access security. No Production modifications.
