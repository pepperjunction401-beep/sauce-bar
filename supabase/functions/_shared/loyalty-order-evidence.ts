// Shared authoritative Square reward receipt validation. No I/O or wallet writes.
export function loyaltyPreviewMatches(preview: any, pricing: any, reward: any, variation: string | null): boolean {
  const lines = preview?.order?.line_items;
  const defs = preview?.order?.discounts;
  const expected = pricing.discounts[0];
  if (!Array.isArray(lines) || lines.length !== pricing.line_items.length ||
      !Array.isArray(defs)) return false;
  const d = defs.filter((x: any) => x.uid === expected.uid);
  if (d.length !== 1 || d[0].scope !== "LINE_ITEM" ||
      d[0].type !== "FIXED_PERCENTAGE" || Number(d[0].percentage) !== Number(expected.percentage)) return false;
  const product = reward.reward_kind === "product";
  const hasDiscount = (line: any) => Array.isArray(line.applied_discounts) &&
    line.applied_discounts.some((x: any) => x.discount_uid === expected.uid);
  const affected = lines.filter(hasDiscount);
  const cents = (line: any) => line.total_money?.amount;
  if (!lines.every((line: any) => Number.isSafeInteger(cents(line)) && cents(line) >= 0)) return false;
  if (product && (affected.length !== 1 || affected[0].quantity !== "1" ||
      affected[0].catalog_object_id !== variation || cents(affected[0]) !== 0 ||
      !lines.filter((line: any) => !hasDiscount(line)).every((line: any) => cents(line) > 0))) return false;
  if (!product && (affected.length !== lines.length || !lines.every((line: any) => cents(line) > 0) ||
      !affected.every((line: any) => line.applied_discounts.some((x: any) =>
        x.discount_uid === expected.uid && Number.isSafeInteger(x.applied_money?.amount) && x.applied_money.amount >= 0)) ||
      !affected.some((line: any) => line.applied_discounts.some((x: any) =>
        x.discount_uid === expected.uid && x.applied_money.amount > 0)))) return false;
  // Compare each line's canonical catalog variation, quantity and discount
  // designation, even when the free SKU is also present as paid merchandise.
  const signature = (line: any) => JSON.stringify([line.catalog_object_id,String(line.quantity),hasDiscount(line)]);
  return JSON.stringify(lines.map(signature).sort()) === JSON.stringify(pricing.line_items.map(signature).sort());
}

export function hasLoyaltyOrderEvidence(order: any): boolean {
  return order?.reference_id === "PJ_LOYALTY" ||
    (order?.discounts ?? []).some((d: any) => ["PJ_LOYALTY_FREE","PJ_LOYALTY_PERCENT"].includes(d.uid)) ||
    (order?.line_items ?? []).some((l: any) => (l.applied_discounts ?? []).some((d: any) =>
      ["PJ_LOYALTY_FREE","PJ_LOYALTY_PERCENT"].includes(d.discount_uid)));
}

