-- Pepper Junction Review Board reward-checkout state — Supabase Testing ONLY.
-- The ordinary Production checkout is untouched.
-- Payment links are not created here. This table records verified, server-created attempts.
create table public.pj_review_reward_checkout_attempts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null,
  row_number integer not null,
  selected_product_id uuid not null references public.pj_products(id),
  checkout_request_id text not null unique check (length(checkout_request_id) between 8 and 100),
  square_order_id text unique,
  square_payment_link_id text unique,
  state text not null default 'creating'
    check (state in ('creating','opened','paid_verified','cancelled','expired')),
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  verified_at timestamptz,
  last_checked_at timestamptz,
  foreign key (customer_id,row_number)
    references public.pj_review_reward_entitlements(customer_id,row_number),
  constraint reward_attempt_state_valid check (
    (state='creating' and square_order_id is null and square_payment_link_id is null and verified_at is null)
    or (state='opened' and square_order_id is not null and square_payment_link_id is not null and opened_at is not null and verified_at is null)
    or (state='paid_verified' and square_order_id is not null and square_payment_link_id is not null and verified_at is not null)
    or (state in ('cancelled','expired') and verified_at is null)
  )
);
create unique index pj_review_one_active_checkout_per_entitlement
on public.pj_review_reward_checkout_attempts(customer_id,row_number)
where state in ('creating','opened');
create index pj_review_reward_checkout_order_idx
on public.pj_review_reward_checkout_attempts(square_order_id)
where square_order_id is not null;
alter table public.pj_review_reward_checkout_attempts enable row level security;
revoke all on public.pj_review_reward_checkout_attempts from anon,authenticated;
grant select,insert on public.pj_review_reward_checkout_attempts to service_role;
grant update (square_order_id,square_payment_link_id,state,opened_at,verified_at,last_checked_at)
  on public.pj_review_reward_checkout_attempts to service_role;
