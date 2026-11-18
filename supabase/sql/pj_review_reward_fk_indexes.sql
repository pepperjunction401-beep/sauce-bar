-- Supabase Testing: targeted indexes for new Review Board FK checks.
create index if not exists pj_reward_attempt_product_idx
 on public.pj_review_reward_checkout_attempts(selected_product_id);
create index if not exists pj_reward_entitlement_product_idx
 on public.pj_review_reward_entitlements(selected_product_id)
 where selected_product_id is not null;
create index if not exists pj_review_slot_credits_position_idx
 on public.pj_review_row_slot_credits(row_number,slot_number);