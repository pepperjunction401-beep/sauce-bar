import { assertEquals } from "jsr:@std/assert@1";
import { fullyPaidOpenSquareOrder, squarePaymentIds } from "./square-payment-evidence.ts";

const order = {
  id: "order-oct21",
  state: "OPEN",
  location_id: "PJ-location",
  total_money: { amount: 5196, currency: "USD" },
};
const payment = {
  id: "payment-oct21",
  order_id: "order-oct21",
  customer_id: "accepted-square-id",
  location_id: "PJ-location",
  status: "COMPLETED",
  total_money: { amount: 5196, currency: "USD" },
};
const check = (payments: typeof payment[]) => fullyPaidOpenSquareOrder({
  order, payments, requiredLocationId: "PJ-location", acceptedCustomerId: "accepted-square-id",
});

Deno.test("OPEN hosted checkout: completed verified payment qualifies", () => {
  assertEquals(check([payment]), true);
  assertEquals(squarePaymentIds([], [payment]), ["payment-oct21"]);
});

Deno.test("OPEN order never qualifies when its payment is incomplete or mismatched", () => {
  assertEquals(check([{ ...payment, status: "APPROVED" }]), false);
  assertEquals(check([{ ...payment, customer_id: "other" }]), false);
  assertEquals(check([{ ...payment, order_id: "other-order" }]), false);
  assertEquals(check([{ ...payment, total_money: { amount: 5000, currency: "USD" } }]), false);
});

Deno.test("split payments qualify only when summed to the full order amount", () => {
  const first = { ...payment, id: "first", total_money: { amount: 2500, currency: "USD" } };
  const second = { ...payment, id: "second", total_money: { amount: 2696, currency: "USD" } };
  assertEquals(check([first, second]), true);
  assertEquals(check([first]), false);
  assertEquals(check([first, first, second]), false);
  assertEquals(squarePaymentIds([{payment_id:"first"}], [first, second]), ["first", "second"]);
});

Deno.test("rejected OPEN orders do not pass evidence checks", () => {
  assertEquals(fullyPaidOpenSquareOrder({ order: { ...order, state: "CANCELED" }, payments: [payment], requiredLocationId: "PJ-location" }), false);
  assertEquals(fullyPaidOpenSquareOrder({ order: { ...order, total_money: undefined }, payments: [payment], requiredLocationId: "PJ-location" }), false);
});
