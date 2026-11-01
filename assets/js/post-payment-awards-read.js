/* Pepper Junction post-payment awards: read-only projection.
 * Stage 1: direct purchase-linked award families. No eligibility evaluation.
 * Not connected to the live page until checkout identity handoff is verified.
 */
(function (root) {
  'use strict';
  async function readPurchaseAwards(client, customerId, purchaseId) {
    if (!client || !customerId || !purchaseId) throw new Error('Verified customer and purchase required');
    const purchase = await client.from('purchases')
      .select('id,customer_id,purchase_status,import_status')
      .eq('id',purchaseId).eq('customer_id',customerId).maybeSingle();
    if (purchase.error) throw purchase.error;
    if (!purchase.data || purchase.data.purchase_status !== 'completed' ||
        purchase.data.import_status !== 'attached') throw new Error('Verified completed purchase unavailable');
    const specs = [
      ['heat','pj_customer_badge_awards','badge_code,earned_at,award_state,reversed_at','source_purchase_id'],
      ['food','pj_food_badge_level_awards','badge_code,earned_level,earned_at','source_purchase_id'],
      ['purchase_progress','pj_purchase_progress_award_events','badge_code,earned_level,earned_at','purchase_id'],
      ['celestial','pj_celestial_awards','edition_year,month_number,earned_at','source_purchase_id'],
      ['round_clock','pj_round_clock_award_events','window_code,created_at,reversed_at','purchase_id']
    ];
    const results = await Promise.all(specs.map(async function(spec) {
      const response = await client.from(spec[1]).select(spec[2])
        .eq(spec[3],purchaseId).eq('customer_id',customerId);
      if (response.error) throw response.error;
      return (response.data || []).filter(function(row) {
        return row.award_state !== 'reversed' && !row.reversed_at;
      }).map(function(row) { return Object.assign({family:spec[0]},row); });
    }));
    return results.flat();
  }
  root.PJPostPaymentAwardRead = Object.freeze({readPurchaseAwards:readPurchaseAwards});
})(window);
