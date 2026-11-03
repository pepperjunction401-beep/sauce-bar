/* Read-only presentation projection; NOT an eligibility or awarding engine.
 * Inputs are authoritative, customer-scoped evidence read by the authenticated
 * endpoint. Near-misses never trigger awards or change existing badge state.
 */
export function projectCloseCalls(input) {
  const { event, purchaseId, heatRows, foodRows, heatDefinitions,
    foodDefinitions, earnedHeatCodes, earnedFoodLevels,
    progressEvents, progressDefinitions } = input;
  if (!event || event.type !== "checkout" || typeof event.id !== "string" ||
      typeof purchaseId !== "string") throw Error("Verified checkout context required");
  const close = [];
  const quantity = value => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  const whole = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0;
  const heatTotals = new Map();
  const heatInPurchase = new Set();
  for (const row of heatRows) {
    const category = row.heat_category;
    if (typeof category !== "string" || !category) continue;
    const n = quantity(row.net_eligible_quantity);
    heatTotals.set(category, (heatTotals.get(category) || 0) + n);
    if (row.purchase_id === purchaseId && n > 0) heatInPurchase.add(category);
  }
  for (const category of heatInPurchase) {
    const total = heatTotals.get(category) || 0;
    const upcoming = heatDefinitions
      .filter(d => d.heat_category === category &&
        !earnedHeatCodes.has(d.badge_code) && whole(d.qualifying_quantity) &&
        Number(d.qualifying_quantity) > total)
      .sort((a,b) => Number(a.qualifying_quantity) - Number(b.qualifying_quantity))[0];
    if (!upcoming || Math.abs(Number(upcoming.qualifying_quantity) - total - 1) > 1e-9) continue;
    close.push({
      title: category + " Heat — Level " + String(upcoming.badge_level),
      description: "One more eligible " + category + " heat bottle would reach the next recorded Heat Identity threshold on a future purchase.",
      attribution: event, family: "heat_identity", badge_code: upcoming.badge_code,
      current_quantity: total, target_quantity: Number(upcoming.qualifying_quantity), remaining_quantity: 1
    });
  }

  const foodTotals = new Map();
  const foodInPurchase = new Set();
  for (const row of foodRows) {
    const code = row.badge_code;
    if (typeof code !== "string" || !code) continue;
    const n = quantity(row.net_eligible_quantity);
    foodTotals.set(code, (foodTotals.get(code) || 0) + n);
    if (row.purchase_id === purchaseId && n > 0) foodInPurchase.add(code);
  }
  for (const code of foodInPurchase) {
    const definition = foodDefinitions.find(d => d.badge_code === code);
    if (!definition || !whole(definition.items_per_level) || Number(definition.items_per_level) < 1) continue;
    const step = Number(definition.items_per_level);
    const total = foodTotals.get(code) || 0;
    const nextLevel = Math.floor(total / step) + 1;
    const nextThreshold = nextLevel * step;
    if (Math.abs(nextThreshold - total - 1) > 1e-9) continue;
    if (Number(earnedFoodLevels.get(code) || 0) >= nextLevel) continue;
    close.push({
      title: String(definition.badge_title || code) + " — Level " + nextLevel,
      description: "One more eligible " + String(definition.food_category || "food category") +
        " bottle would reach the next recorded Food Badge threshold on a future purchase.",
      attribution: event, family: "food", badge_code: code,
      current_quantity: total, target_quantity: nextThreshold, remaining_quantity: 1,
      // Read-only display evidence for the current tier (e.g. bottle 4 of 5).
      // Badge eligibility remains owned by the existing engine.
      level_step: step, level_completed: total - (nextThreshold - step)
    });
  }

  // Money projection uses ONLY the existing purchase-progress award event's
  // qualifying_amount. It does not reprice, classify, or evaluate the purchase.
  for (const row of progressEvents) {
    if (row.purchase_id !== purchaseId || quantity(row.net_progress) <= 0) continue;
    const dollars = Number(row.qualifying_amount);
    if (!Number.isFinite(dollars) || dollars < 0) continue;
    const cents = Math.round(dollars * 100);
    const next = progressDefinitions
      .filter(d => Number.isFinite(Number(d.threshold_amount)) &&
        Math.round(Number(d.threshold_amount) * 100) > cents)
      .sort((a,b) => Number(a.threshold_amount) - Number(b.threshold_amount))[0];
    if (!next) continue;
    const remainingCents = Math.round(Number(next.threshold_amount) * 100) - cents;
    if (remainingCents <= 0 || remainingCents >= 1000) continue; // strictly under $10
    close.push({
      title: String(next.badge_title || next.badge_code) + " — Spending Tier",
      description: "This completed checkout was $" + (remainingCents / 100).toFixed(2) +
        " short of the next Purchase Progress tier. A future checkout is a fresh opportunity.",
      attribution: event, family: "purchase_progress", badge_code: next.badge_code,
      current_cents: cents, target_cents: Math.round(Number(next.threshold_amount) * 100),
      remaining_cents: remainingCents
    });
  }
  // Highest relevance first; no duplicates and no fabricated "nearly earned".
  const seen = new Set();
  return close.filter(item => {
    const key = item.family + ":" + item.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
}
