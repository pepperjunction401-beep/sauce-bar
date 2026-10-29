// Passenger Class merchandise-only evidence. Does not change CNS mapping or product awards.
type Money = { amount?: number; currency?: string };
type OrderLine = {
 uid?: string; catalog_object_id?: string; name?: string; quantity?: string;
 total_money?: Money; total_tax_money?: Money;
};
function cents(n: unknown): number | null {
 return typeof n==="number" && Number.isSafeInteger(n) && n>=0 ? n : null;
}
export function passengerMerchandiseEvidence(lines: OrderLine[], purchaseId: string) {
 const seen = new Set<string>();
 const out: Array<Record<string, unknown>> = [];
 for(const line of lines) {
  const uid = line.uid;
  const gross = cents(line.total_money?.amount);
  const tax = line.total_tax_money?.amount===undefined ? 0 : cents(line.total_tax_money.amount);
  const qty = Number(line.quantity);
  if(!uid || seen.has(uid) || gross===null || tax===null || tax>gross || !Number.isFinite(qty) || qty<=0) continue;
  seen.add(uid);
  const description=(line.name??"").trim();
  const shipping=/^(shipping|delivery|postage|freight|handling)(\s|$|[-:])/i.test(description);
  const classification=shipping ? "shipping" : !description && !line.catalog_object_id ? "unknown" : "merchandise";
  out.push({
   purchase_id:purchaseId, square_line_uid:uid,
   square_catalog_object_id:line.catalog_object_id??null,
   square_item_name:description||null, classification,
   quantity:qty, gross_line_cents:gross,
   merchandise_net_cents: classification==="merchandise" ? gross-tax : 0,
   evidence_source:"square_order_line"
  });
 }
 return out;
}
export async function recordPassengerMerchandiseEvidence(
 admin: {from:(table:string)=>any}, purchaseId:string,lines:OrderLine[]
) {
 const evidence=passengerMerchandiseEvidence(lines,purchaseId);
 if(!evidence.length) return;
 // Append-only table: existing evidence is intentionally not updated.
 const {error}=await admin.from("pj_passenger_merchandise_evidence")
  .upsert(evidence,{onConflict:"purchase_id,square_line_uid",ignoreDuplicates:true});
 if(error) throw new Error("Passenger merchandise evidence save failed: "+error.message);
}
