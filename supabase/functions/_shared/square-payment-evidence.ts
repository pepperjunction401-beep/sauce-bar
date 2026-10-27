// Shared Square payment evidence rules for Phase 2 transaction intake.
// No network calls, customer matching, database writes, or rewards behavior here.
export type PaymentEvidence = {
  id?: string;
  order_id?: string;
  customer_id?: string;
  location_id?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  amount_money?: { amount?: number; currency?: string };
  total_money?: { amount?: number; currency?: string };
};

export function squarePaymentIds(
  tenders: Array<{ payment_id?: string }> | undefined,
  payments: PaymentEvidence[] = [],
): string[] {
  return Array.from(new Set([
    ...(tenders ?? []).map((t) => t.payment_id),
    ...payments.map((p) => p.id),
  ].filter((id): id is string => typeof id === "string" && id.length > 0)));
}

// An OPEN order may be treated as paid only with matching Square-confirmed
// payments. This never accepts a payment with absent/mismatched provenance.
export function fullyPaidOpenSquareOrder(args: {
  order: { id?: string; state?: string; location_id?: string; total_money?: { amount?: number; currency?: string } };
  payments: PaymentEvidence[];
  acceptedCustomerId?: string;
  requiredLocationId: string;
}): boolean {
  const { order, payments, acceptedCustomerId, requiredLocationId } = args;
  const expected = order.total_money?.amount;
  const currency = order.total_money?.currency;
  if (order.state !== "OPEN" || !order.id || !currency ||
      order.location_id !== requiredLocationId ||
      typeof expected !== "number" || !Number.isSafeInteger(expected) || expected <= 0 ||
      payments.length === 0) return false;
  let paid = 0;
  const seen = new Set<string>();
  for (const payment of payments) {
    if (!payment.id || seen.has(payment.id) || payment.status !== "COMPLETED" ||
        payment.order_id !== order.id || payment.location_id !== requiredLocationId ||
        (acceptedCustomerId && payment.customer_id !== acceptedCustomerId)) return false;
    seen.add(payment.id);
    const amount = payment.total_money?.amount ?? payment.amount_money?.amount;
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0 ||
        (payment.total_money?.currency ?? payment.amount_money?.currency) !== currency) return false;
    paid += amount;
  }
  return paid === expected;
}
