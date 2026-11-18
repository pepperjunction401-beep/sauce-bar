-- Testing-only authorization for authenticated server-side reward selection.
-- Service Role is the only writer; no browser grants or RLS policies.
grant update (status, selected_product_id, selected_at)
on table public.pj_review_reward_entitlements to service_role;