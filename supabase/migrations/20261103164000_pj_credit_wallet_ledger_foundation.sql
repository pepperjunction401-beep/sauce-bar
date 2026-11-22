-- PEPPER JUNCTION — PHASE 3 / PJ CREDITS STAGE 1
-- Wallet and immutable earning/spend audit foundation only.
-- Governing sources: PJ Badge Rules v4.4 §§16A–16C, 22E, 23A–23D;
-- PJ Credits & Loyalty Bridge Architecture Blueprint §§6, 9, 10, 15.
-- No Square checkout, payment-link, cart, Railroad, Phase 1/2, or existing badge
-- changes. No purchase triggers or automatic credit processing are installed.
-- A later, separately tested Phase 3 evaluator must first verify the attached,
-- completed Square-confirmed purchase and write wallet+ledger atomically.

create table public.pj_credit_wallets (
  customer_id uuid primary key references public.customer_profiles(id) on delete restrict,
  balance integer not null default 0 check (balance between 0 and 275),
  row_version bigint not null default 0 check (row_version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.pj_credit_wallets is
  'Phase 3 authoritative non-expiring PJ Credit balance (0 to 275). Only the controlled engine may change this balance.';

create table public.pj_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.pj_credit_wallets(customer_id) on delete restrict,
  event_kind text not null check (event_kind in (
    'purchase_earn', 'loyalty_exchange', 'square_refund_reversal', 'owner_correction'
  )),
  event_key text not null unique check (length(btrim(event_key)) between 1 and 200),
  source_purchase_id uuid references public.purchases(id) on delete restrict,
  requested_credits integer check (requested_credits is null or requested_credits >= 0),
  credit_delta integer not null,
  balance_before integer not null check (balance_before between 0 and 275),
  balance_after integer not null check (balance_after between 0 and 275),
  rules_version text not null check (length(btrim(rules_version)) > 0),
  source_effective_at timestamptz,
  recorded_at timestamptz not null default now(),
  check (balance_after = balance_before + credit_delta),
  -- A processed purchase must be recorded even if the cap yields zero credits.
  check (event_kind <> 'purchase_earn' or (
    source_purchase_id is not null and
    requested_credits is not null and
    credit_delta between 0 and requested_credits
  ))
);
comment on table public.pj_credit_ledger is
  'Private append-only Phase 3 PJ Credit earning/exchange/reversal/correction audit. Exactly one purchase_earn event per evaluated Square-accepted purchase, including zero at cap.';

create unique index pj_credit_ledger_one_earn_per_purchase
  on public.pj_credit_ledger (source_purchase_id)
  where event_kind = 'purchase_earn';
create index pj_credit_ledger_customer_recorded_at
  on public.pj_credit_ledger (customer_id, recorded_at, id);

-- No ledger event may be rewritten or deleted. Corrections must be new entries.
create function public.pj_credit_ledger_immutable_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'PJ_CREDIT_LEDGER_IMMUTABLE';
end;
$$;
create trigger pj_credit_ledger_immutable
  before update or delete on public.pj_credit_ledger
  for each row execute function public.pj_credit_ledger_immutable_guard();

-- Keep private objects inaccessible to browser roles, even if Data API is on.
alter table public.pj_credit_wallets enable row level security;
alter table public.pj_credit_ledger enable row level security;
revoke all on public.pj_credit_wallets, public.pj_credit_ledger
  from public, anon, authenticated, service_role;
revoke all on function public.pj_credit_ledger_immutable_guard()
  from public, anon, authenticated, service_role;

-- Permit only trusted server-side workers; no direct client permission.
grant select, insert, update on public.pj_credit_wallets to service_role;
grant select, insert on public.pj_credit_ledger to service_role;
-- The immutable guard is invoked by its table trigger, not by application calls.
