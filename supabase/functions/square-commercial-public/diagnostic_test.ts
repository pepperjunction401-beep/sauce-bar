import { commercialDiagnostic } from "./diagnostic.js";

Deno.test("exact PostgREST JWT timing error is retained", () => {
  const d = commercialDiagnostic("pj_products", {code:"PGRST303",message:"JWT issued at future"}, ["stanky-sauce-clasico"], "2026-11-27T00:00:00.000Z");
  if (d.code !== "PGRST303" || d.message !== "JWT issued at future" || d.product_ids[0] !== "stanky-sauce-clasico" || d.unknown_product_count !== 0 || d.timestamp !== "2026-11-27T00:00:00.000Z") throw Error("diagnostic mismatch");
});
Deno.test("unexpected text and input are withheld", () => {
  const secret = "synthetic-secret-not-for-logs";
  const d = commercialDiagnostic("product_commercial_state", {code:secret,message:secret,details:secret,hint:secret}, [secret,"high-river-sauces-rogue"], "2026-11-27T00:00:00.000Z");
  if (JSON.stringify(d).includes(secret) || d.unknown_product_count !== 1 || d.product_ids.length !== 1 || d.code !== "unclassified") throw Error("redaction failed");
});
