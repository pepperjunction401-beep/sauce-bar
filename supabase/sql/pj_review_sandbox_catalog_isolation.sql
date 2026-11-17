-- Review Board Square SANDBOX fixtures: isolated from Production Square item mapping.
-- Only verified Sandbox catalog IDs may authorize a test checkout.
create table public.pj_review_sandbox_catalog (
  product_id uuid primary key references public.pj_products(id),
  fixture_role text not null check (fixture_role in ('reward','paid')),
  square_sandbox_item_id text,
  square_sandbox_variation_id text unique,
  expected_price_cents integer check (expected_price_cents > 0),
  sandbox_verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint pj_review_sandbox_verified_complete check (
    sandbox_verified_at is null
    or (
      length(coalesce(square_sandbox_item_id,'')) > 0
      and length(coalesce(square_sandbox_variation_id,'')) > 0
      and expected_price_cents > 0
    )
  )
);
alter table public.pj_review_sandbox_catalog enable row level security;
revoke all on public.pj_review_sandbox_catalog from public,anon,authenticated;
grant select on public.pj_review_sandbox_catalog to service_role;

insert into public.pj_review_sandbox_catalog(product_id,fixture_role)
select b.product_id,
  case when b.row_number=1 and b.slot_number=1 then 'reward' else 'paid' end
from public.pj_review_board_slots b
where (b.row_number=1 and b.slot_number=1)
   or (b.row_number=2 and b.slot_number=1);
do $guard$
begin
 if (select count(*) from public.pj_review_sandbox_catalog)<>2
 then raise exception 'REVIEW_SANDBOX_TWO_FIXTURES_REQUIRED'; end if;
end
$guard$;