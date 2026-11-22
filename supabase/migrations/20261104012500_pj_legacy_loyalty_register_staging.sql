-- Pepper Junction / isolated Phase 3 Legacy Loyalty Register.
-- Dev and isolated Testing only. No Phase 1/2 edits, Square calls or wallet awards.
-- Membership cohort is independent of the Square Loyalty subscription once captured.

create table public.pj_legacy_loyalty_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_program_id text not null check(length(btrim(source_program_id)) between 1 and 128),
  square_api_version text not null,
  capture_started_at timestamptz not null,
  capture_finished_at timestamptz not null,
  archive_sha256 text not null check(archive_sha256 ~ '^[0-9a-f]{64}$'),
  expected_accounts integer not null check(expected_accounts >= 0),
  accounts_complete boolean not null default false,
  events_complete boolean not null default false,
  rewards_complete boolean not null default false,
  state text not null default 'staging' check(state in ('staging','sealed')),
  created_at timestamptz not null default now(),
  sealed_at timestamptz,
  check(capture_finished_at >= capture_started_at),
  check((state='staging' and sealed_at is null) or (state='sealed' and sealed_at is not null)),
  unique(source_program_id, archive_sha256)
);

create table public.pj_legacy_loyalty_members (
  snapshot_id uuid not null references public.pj_legacy_loyalty_snapshots(id) on delete restrict,
  square_loyalty_account_id text not null check(length(btrim(square_loyalty_account_id)) > 0),
  square_customer_id text,
  square_available_points integer,
  square_lifetime_points integer,
  source_updated_at timestamptz,
  raw_account_sha256 text not null check(raw_account_sha256 ~ '^[0-9a-f]{64}$'),
  staged_at timestamptz not null default now(),
  primary key(snapshot_id, square_loyalty_account_id),
  check(square_customer_id is null or length(btrim(square_customer_id)) > 0),
  check(square_lifetime_points is null or square_lifetime_points >= 0)
);
create index pj_legacy_loyalty_members_customer_lookup
  on public.pj_legacy_loyalty_members(snapshot_id,square_customer_id);

-- Disabled unless owner explicitly signs off on cohort, reconciliation and go-live.
-- This flag is NOT connected to existing badges or purchase/checkout triggers.
create table public.pj_legacy_loyalty_activation (
  singleton boolean primary key default true check(singleton),
  snapshot_id uuid references public.pj_legacy_loyalty_snapshots(id) on delete restrict,
  transfers_enabled boolean not null default false,
  nonmember_history_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  check((not transfers_enabled and not nonmember_history_enabled) or snapshot_id is not null)
);
insert into public.pj_legacy_loyalty_activation(singleton) values(true);

comment on table public.pj_legacy_loyalty_members is
  'Frozen Square Loyalty member cohort with actual available points. No direct PJ wallet authority.';
comment on table public.pj_legacy_loyalty_activation is
  'Owner launch gate. Initially off. Does not affect existing badge families.';

alter table public.pj_legacy_loyalty_snapshots enable row level security;
alter table public.pj_legacy_loyalty_members enable row level security;
alter table public.pj_legacy_loyalty_activation enable row level security;
revoke all on public.pj_legacy_loyalty_snapshots,
  public.pj_legacy_loyalty_members,public.pj_legacy_loyalty_activation
  from public,anon,authenticated,service_role;
grant select,insert,update on public.pj_legacy_loyalty_snapshots to service_role;
grant select,insert on public.pj_legacy_loyalty_members to service_role;
grant select,update on public.pj_legacy_loyalty_activation to service_role;
