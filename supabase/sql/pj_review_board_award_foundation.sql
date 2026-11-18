-- Review Board achievement foundation (Testing first; not Production).
-- Source of row positions: the approved 68-product Sauce-Bar-Dev Passenger Station manifest.
-- Business rule: original questionnaire accepted = slot progress; no public moderation gate.
-- One completed eight-product row => one permanent achievement and one unselected entitlement.
-- Do not modify these slots or substitute products without explicit owner authorization.

create table public.pj_review_board_slots (
  row_number integer not null check (row_number > 0),
  slot_number integer not null check (slot_number between 1 and 8),
  product_id uuid not null references public.pj_products(id),
  primary key (row_number, slot_number),
  unique (product_id)
);

insert into public.pj_review_board_slots(row_number,slot_number,product_id)
select lineup.row_number,lineup.slot_number,p.id
from (values
(1, 1, 'sauce-crafters-hogs-ass-garlic-habanero-sauce'),
(1, 2, 'melindas-original-naga-jolokia'),
(1, 3, 'sauce-crafters-mountain-man-fire-roasted-habanero'),
(1, 4, 'sauce-crafters-colon-cleaner-mustard'),
(1, 5, 'melindas-scotch-bonnet-sauce'),
(1, 6, 'melindas-mango-habanero'),
(1, 7, 'melindas-naga-jolokia-ketchup'),
(1, 8, 'high-river-sauces-foo-foo-mama-choo'),
(2, 1, 'high-river-sauces-rogue'),
(2, 2, 'high-river-sauces-tears-of-the-sun'),
(2, 3, 'high-river-sauces-hellacious'),
(2, 4, 'sucklebusters-original-bbq'),
(2, 5, 'sucklebusters-bbq-chipotle'),
(2, 6, 'heartbreaking-dawns-the-green'),
(2, 7, 'defcon-cluckwing'),
(2, 8, 'walker-son-slap-ya-mama-cajun-original'),
(3, 1, 'ghost-scream'),
(3, 2, 'rheds-original'),
(3, 3, 'walker-son-slap-ya-mama-hot-sauce'),
(3, 4, 'sucklebusters-clucker-dust-14oz'),
(3, 5, 'sucklebusters-hogwaller-14oz'),
(3, 6, 'melindas-chipotle-ketchup'),
(3, 7, 'dirty-dicks-hot-tropical-hot-sauce'),
(3, 8, 'ashley-foods-mad-dog-sriracha'),
(4, 1, 'rheds-lemon-drop'),
(4, 2, 'cajohns-la-segadora-carolina-reaper'),
(4, 3, 'high-river-sauces-thunder-juice'),
(4, 4, 'rheds-deja-vu'),
(4, 5, 'defcon-curbstomp'),
(4, 6, 'defcon-condition-2'),
(4, 7, 'defcon-condition-3'),
(4, 8, '2-pig-mafia-steak-seasoning-14oz'),
(5, 1, 'sucklebusters-bamm-14oz'),
(5, 2, 'suckelbusters-1836-14oz'),
(5, 3, 'pepper-junction-all-purpose-spg-14oz'),
(5, 4, 'walker-son-slap-ya-mama-cajun-hot'),
(5, 5, 'mikey-vs-i-love-taco-sauce-hot'),
(5, 6, 'mikey-vs-gator-toes-spicy'),
(5, 7, 'the-spicy-shark-habanero-maple-syrup'),
(5, 8, 'puckerbutt-puckerbutt-gator-sauce'),
(6, 1, '13-stars-dragons-breath'),
(6, 2, 'mikey-vs-gator-toes-bbq'),
(6, 3, 'mikey-vs-gator-toes-loco-spice'),
(6, 4, 'ass-kickin-habanero-garlic-salt'),
(6, 5, 'mikey-vs-ghostly-garlic'),
(6, 6, 'mikey-vs-jalapeno-dill-pickle'),
(6, 7, 'ariston-fig-infused-balsamic-vinegar'),
(6, 8, 'ariston-tuscan-herb-infused-olive-oil'),
(7, 1, 'mikey-vs-gator-toes-dill-pickle'),
(7, 2, 'ariston-chili-infused-olive-oil'),
(7, 3, 'ariston-garlic-infused-olive-oil'),
(7, 4, 'ariston-black-cherry-infused-balsamic-vinegar'),
(7, 5, 'hells-kitchen-coconut-curry'),
(7, 6, 'hells-kitchen-cinnamon-ghost'),
(7, 7, 'hells-kitchen-black-forest'),
(7, 8, 'high-river-sauces-psych-sauce'),
(8, 1, 'mikey-vs-reaper-jalapeno-dill-pickle'),
(8, 2, 'high-river-sauces-taco-x'),
(8, 3, 'high-river-sauces-peppers-up'),
(8, 4, 'mikey-vs-gator-toes-buffalo'),
(8, 5, 'walker-son-slap-ya-mama-cajun-low-sodium'),
(8, 6, 'ariston-lemon-infused-olive-oil'),
(8, 7, 'stanky-sauce-clasico'),
(8, 8, 'sweet-gs-smoked-cheddar-pretzels-sourdough'),
(9, 1, 'hells-kitchen-black-westside-red'),
(9, 2, 'sauce-leopard-road-dawg-red-chili-garlic'),
(9, 3, 'stanky-honey-mango-habanero'),
(9, 4, 'sweet-gs-smoked-cheddar-pretzels-spicy')
) as lineup(row_number,slot_number,cns_slug)
join public.pj_products p on p.cns_slug=lineup.cns_slug;

do $validation$
begin
  if (select count(*) from public.pj_review_board_slots) <> 68 then
    raise exception 'BOARD_ROSTER_INCOMPLETE: Expected 68 valid source products';
  end if;
  if (select count(*) from public.pj_review_board_slots where row_number=9) <> 4 then
    raise exception 'BOARD_ROW_9_MISMATCH';
  end if;
end
$validation$;

create table public.pj_review_row_slot_credits (
  customer_id uuid not null references public.customer_profiles(id),
  row_number integer not null,
  slot_number integer not null,
  original_review_id uuid not null references public.pj_review_submissions(id),
  credited_at timestamptz not null default now(),
  primary key (customer_id,row_number,slot_number),
  unique (original_review_id),
  foreign key (row_number,slot_number)
    references public.pj_review_board_slots(row_number,slot_number)
);

create table public.pj_review_row_achievements (
  customer_id uuid not null references public.customer_profiles(id),
  row_number integer not null check (row_number > 0),
  achieved_at timestamptz not null default now(),
  primary key (customer_id,row_number)
);

create table public.pj_review_reward_entitlements (
  customer_id uuid not null,
  row_number integer not null,
  status text not null default 'available'
    check (status in ('available','selected','redeemed')),
  selected_product_id uuid references public.pj_products(id),
  selected_at timestamptz,
  redeemed_square_order_id text unique,
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (customer_id,row_number),
  foreign key (customer_id,row_number)
    references public.pj_review_row_achievements(customer_id,row_number),
  constraint review_entitlement_state_consistent check (
    (status='available' and selected_product_id is null and selected_at is null and redeemed_square_order_id is null and redeemed_at is null)
    or
    (status='selected' and selected_product_id is not null and selected_at is not null and redeemed_square_order_id is null and redeemed_at is null)
    or
    (status='redeemed' and selected_product_id is not null and selected_at is not null and redeemed_square_order_id is not null and redeemed_at is not null)
  )
);

create index pj_review_slot_credits_customer_row_idx
on public.pj_review_row_slot_credits(customer_id,row_number);

-- No browser writes or reads. Future authenticated APIs must enforce their own verified-user checks.
alter table public.pj_review_board_slots enable row level security;
alter table public.pj_review_row_slot_credits enable row level security;
alter table public.pj_review_row_achievements enable row level security;
alter table public.pj_review_reward_entitlements enable row level security;
revoke all on public.pj_review_board_slots from anon, authenticated;
revoke all on public.pj_review_row_slot_credits from anon, authenticated;
revoke all on public.pj_review_row_achievements from anon, authenticated;
revoke all on public.pj_review_reward_entitlements from anon, authenticated;
grant select on public.pj_review_board_slots to service_role;
grant select, insert on public.pj_review_row_slot_credits to service_role;
grant select, insert on public.pj_review_row_achievements to service_role;
grant select, insert on public.pj_review_reward_entitlements to service_role;

create function public.pj_review_board_credit_accepted_submission()
returns trigger language plpgsql security invoker
set search_path to ''
as $function$
declare
  v_row integer;
  v_slot integer;
  v_filled integer;
  v_credited integer;
begin
  select row_number,slot_number into v_row,v_slot
  from public.pj_review_board_slots
  where product_id=new.product_id;
  if not found then return new; end if;

  -- Serialize review awards for simultaneous submissions by the same customer/row.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(new.customer_id::text),v_row);

  insert into public.pj_review_row_slot_credits
    (customer_id,row_number,slot_number,original_review_id)
  values (new.customer_id,v_row,v_slot,new.id)
  on conflict do nothing;

  select count(*) into v_filled from public.pj_review_board_slots
  where row_number=v_row;
  if v_filled <> 8 then return new; end if;

  select count(*) into v_credited from public.pj_review_row_slot_credits
  where customer_id=new.customer_id and row_number=v_row;
  if v_credited <> 8 then return new; end if;

  insert into public.pj_review_row_achievements (customer_id,row_number)
  values (new.customer_id,v_row) on conflict do nothing;

  insert into public.pj_review_reward_entitlements (customer_id,row_number)
  values (new.customer_id,v_row) on conflict do nothing;
  return new;
end
$function$;

revoke all on function public.pj_review_board_credit_accepted_submission() from public,anon,authenticated;
create trigger pj_review_board_accepted_submission
after insert on public.pj_review_submissions
for each row execute function public.pj_review_board_credit_accepted_submission();
