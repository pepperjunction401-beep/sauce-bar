-- Pepper Junction Review System: isolated original-review intake and private journal foundation.
-- Dev/Testing only; never execute against Production without separate owner authorization.
-- This reuses Phase 1 verified customer identity and Phase 2 attached Square purchases.
create table public.pj_review_submissions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id),
  product_id uuid not null references public.pj_products(id),
  qualifying_purchase_id uuid not null references public.purchases(id),
  product_slug_snapshot text not null,
  q1 text not null, q2 text not null, q3 text not null,
  q4 text not null, q5 text not null, q6 text not null,
  q7 text not null, q8 text not null, q9 text not null,
  q10 text not null, q11 text[] not null, q12 text not null, q13 text not null,
  q16 text not null, q17 integer not null,
  q14_original text not null, q15_original text not null,
  points_raw integer not null,
  moderation_status text not null default 'pending',
  public_q15 text,
  submitted_at timestamptz not null default now(),
  constraint pj_review_original_once unique(customer_id,product_id),
  constraint pj_review_points_range check(points_raw between 6 and 12),
  constraint pj_review_q11_count check(cardinality(q11) between 1 and 3),
  constraint pj_review_q17_range check(q17 between 1 and 5),
  constraint pj_review_original_q14_length check(length(q14_original) between 1 and 200),
  constraint pj_review_original_q15_length check(length(q15_original) between 1 and 200),
  constraint pj_review_mod_state check(moderation_status in ('pending','approved','frozen','rejected'))
);
comment on table public.pj_review_submissions is 'One immutable original questionnaire per verified customer/product. Pending intake is not public approval, People''s Choice or Badge progress.';
create index pj_review_customer_order on public.pj_review_submissions(customer_id,submitted_at desc);
create table public.pj_review_private_notes (
  customer_id uuid not null references public.customer_profiles(id),
  product_id uuid not null references public.pj_products(id),
  review_id uuid not null unique references public.pj_review_submissions(id),
  food_notes text not null,
  tasting_notes text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(customer_id,product_id)
);
comment on table public.pj_review_private_notes is 'Review Yard customer-only q14/q15 note copies. Initialized once; independent after original submission.';
create table public.pj_review_personal_ratings (
  customer_id uuid not null references public.customer_profiles(id),
  product_slug text not null check(btrim(product_slug)<> ''),
  rating numeric(3,2) not null check(rating between 1 and 5 and rating*4=trunc(rating*4)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(customer_id,product_slug)
);
comment on table public.pj_review_personal_ratings is 'Private quarter-step rating; any verified signed-in customer, purchase independent, never part of People''s Choice.';

alter table public.pj_review_submissions enable row level security;
alter table public.pj_review_private_notes enable row level security;
alter table public.pj_review_personal_ratings enable row level security;
revoke all on public.pj_review_submissions,public.pj_review_private_notes,public.pj_review_personal_ratings from public,anon,authenticated;
grant select on public.pj_review_submissions to authenticated;
grant select on public.pj_review_private_notes to authenticated;
grant update(food_notes,tasting_notes,updated_at) on public.pj_review_private_notes to authenticated;
grant select,insert on public.pj_review_personal_ratings to authenticated;
grant update(rating,updated_at) on public.pj_review_personal_ratings to authenticated;

create policy pj_review_submissions_owner_read on public.pj_review_submissions
for select to authenticated using (customer_id=(select auth.uid()));
create policy pj_review_private_notes_owner_read on public.pj_review_private_notes
for select to authenticated using (customer_id=(select auth.uid()));
create policy pj_review_private_notes_owner_update on public.pj_review_private_notes
for update to authenticated using (customer_id=(select auth.uid()))
with check(customer_id=(select auth.uid()));
create policy pj_review_ratings_owner_read on public.pj_review_personal_ratings
for select to authenticated using (customer_id=(select auth.uid()));
create policy pj_review_ratings_owner_insert on public.pj_review_personal_ratings
for insert to authenticated with check(customer_id=(select auth.uid()));
create policy pj_review_ratings_owner_update on public.pj_review_personal_ratings
for update to authenticated using (customer_id=(select auth.uid()))
with check(customer_id=(select auth.uid()));

-- Only the project service key (Edge Function) can ask about entitlement.
-- This is a read of existing Phase 2 evidence, not an import or a competing verification engine.
create function public.pj_review_status_for_customer(p_customer_id uuid,p_slug text)
returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare
  v_product_id uuid;
  v_purchase_id uuid;
  v_verified boolean;
  v_review_id uuid;
begin
  if p_customer_id is null or p_slug is null or length(btrim(p_slug))=0 then
    return jsonb_build_object('signedIn',true,'eligible',false,'alreadyReviewed',false,'reason','NO_QUALIFYING_PURCHASE');
  end if;
  select (cp.account_state='verified_matched') into v_verified
    from public.customer_profiles cp where cp.id=p_customer_id;
  if coalesce(v_verified,false)=false then
    return jsonb_build_object('signedIn',true,'eligible',false,'alreadyReviewed',false,'reason','ACCOUNT_NOT_VERIFIED');
  end if;
  select id into v_product_id from public.pj_products where cns_slug=p_slug;
  if v_product_id is null then
    return jsonb_build_object('signedIn',true,'eligible',false,'alreadyReviewed',false,'reason','NO_QUALIFYING_PURCHASE');
  end if;
  select id into v_review_id from public.pj_review_submissions
    where customer_id=p_customer_id and product_id=v_product_id;
  if v_review_id is not null then
    return jsonb_build_object('signedIn',true,'eligible',false,'alreadyReviewed',true,'reason','ALREADY_REVIEWED');
  end if;
  select p.id into v_purchase_id
  from public.purchase_line_items li
  join public.purchases p on p.id=li.purchase_id
  where li.product_id=v_product_id
    and p.customer_id=p_customer_id
    and p.purchase_status='completed'
    and p.import_status='attached'
    and p.completed_at is not null
    and li.quantity>0 and li.line_total_amount>0
    and coalesce((
      select sum(r.refund_amount) from public.purchase_refunds r
      where r.purchase_line_item_id=li.id
        and lower(r.refund_status) in ('completed','approved','succeeded')
    ),0)<li.line_total_amount
    and not exists (
      select 1 from public.purchase_refunds r
      where r.purchase_id=p.id and r.purchase_line_item_id is null
        and lower(r.refund_status) in ('completed','approved','succeeded')
        and r.refund_amount>=p.total_amount
    )
  order by p.completed_at,p.id
  limit 1;
  return jsonb_build_object(
    'signedIn',true,'eligible',v_purchase_id is not null,'alreadyReviewed',false,
    'reason',case when v_purchase_id is null then 'NO_QUALIFYING_PURCHASE' else null end,
    'qualifyingPurchaseId',v_purchase_id);
end $fn$;

-- Restricted intake. All option validation and current CNS lookup occur inside the
-- authenticated Edge Function, which alone possesses the service key.
-- Deliberately pending only: no auto-approval, public aggregation or badge event yet.
create function public.pj_review_accept_original(
  p_customer_id uuid, p_slug text, p_answers jsonb, p_points integer
) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare
  v_status jsonb;
  v_product_id uuid;
  v_review_id uuid;
  v_purchase_id uuid;
begin
  if p_customer_id is null or p_slug is null or p_answers is null
    or p_points not between 6 and 12 then
    raise exception 'INVALID_REVIEW' using errcode='22023';
  end if;
  v_status:=public.pj_review_status_for_customer(p_customer_id,p_slug);
  if coalesce((v_status->>'alreadyReviewed')::boolean,false) then
    raise exception 'ALREADY_REVIEWED' using errcode='23505';
  end if;
  if not coalesce((v_status->>'eligible')::boolean,false) then
    raise exception 'NOT_ELIGIBLE' using errcode='42501';
  end if;
  v_purchase_id:=(v_status->>'qualifyingPurchaseId')::uuid;
  select id into strict v_product_id from public.pj_products where cns_slug=p_slug;
  insert into public.pj_review_submissions(
    customer_id,product_id,qualifying_purchase_id,product_slug_snapshot,
    q1,q2,q3,q4,q5,q6,q7,q8,q9,q10,q11,q12,q13,q16,q17,
    q14_original,q15_original,points_raw
  ) values(
    p_customer_id,v_product_id,v_purchase_id,p_slug,
    p_answers->>'q1',p_answers->>'q2',p_answers->>'q3',p_answers->>'q4',
    p_answers->>'q5',p_answers->>'q6',p_answers->>'q7',p_answers->>'q8',
    p_answers->>'q9',p_answers->>'q10',
    array(select jsonb_array_elements_text(p_answers->'q11')),
    p_answers->>'q12',p_answers->>'q13',p_answers->>'q16',(p_answers->>'q17')::integer,
    p_answers->>'q14',p_answers->>'q15',p_points
  ) returning id into v_review_id;
  insert into public.pj_review_private_notes(customer_id,product_id,review_id,food_notes,tasting_notes)
  values(p_customer_id,v_product_id,v_review_id,p_answers->>'q14',p_answers->>'q15')
  on conflict(customer_id,product_id) do nothing;
  return jsonb_build_object('ok',true,'reviewId',v_review_id,'moderationStatus','PENDING');
end $fn$;

revoke execute on function public.pj_review_status_for_customer(uuid,text) from public,anon,authenticated;
revoke execute on function public.pj_review_accept_original(uuid,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.pj_review_status_for_customer(uuid,text) to service_role;
grant execute on function public.pj_review_accept_original(uuid,text,jsonb,integer) to service_role;
