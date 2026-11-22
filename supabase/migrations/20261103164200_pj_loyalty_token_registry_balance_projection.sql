-- Pepper Junction Phase 3 / 15 owner-defined Loyalty Bridge tokens.
-- No exchange activation, no permanent-consumption policy, no commerce hooks.
create table public.pj_loyalty_token_definitions (
  token_number smallint primary key check(token_number between 1 and 15),
  token_key text not null unique check(length(btrim(token_key))>0),
  bridge_label text not null,
  tier_cost smallint not null check(tier_cost in (50,75,100,125,150,175,200,225)),
  reward_kind text not null check(reward_kind in ('product','discount')),
  reward_product_slug text references public.pj_products(cns_slug) on delete restrict,
  discount_percent smallint,
  front_art_path text not null,
  back_art_path text not null,
  rules_version text not null default '4.4',
  check (
    (reward_kind='product' and reward_product_slug is not null and discount_percent is null)
    or (reward_kind='discount' and reward_product_slug is null and discount_percent in (10,15,20))
  )
);
comment on table public.pj_loyalty_token_definitions is
  'The 15 governing Loyalty Bridge rewards. Balance qualification is dynamic; this is not a permanent award ledger.';
alter table public.pj_loyalty_token_definitions enable row level security;
revoke all on public.pj_loyalty_token_definitions from public, anon, authenticated, service_role;
grant select on public.pj_loyalty_token_definitions to service_role;

insert into public.pj_loyalty_token_definitions (
 token_number,token_key,bridge_label,tier_cost,reward_kind,reward_product_slug,
 discount_percent,front_art_path,back_art_path,rules_version
)
select v.token_number,v.token_key,v.bridge_label,v.tier_cost,v.reward_kind,
 v.reward_product_slug,v.discount_percent,
 'assets/badges/loyalty/badge-loyalty-'||v.token_key||'.png',
 'assets/badges/loyalty/badge-loyalty-'||v.token_key||'-reverse.png','4.4'
from (values
  (1, 'bixby-creek', 'Bixby Creek Bridge', 50, 'product', 'walker-son-slap-ya-mama-cajun-original', null),
  (2, 'seven-mile', 'Seven Mile Bridge', 50, 'product', 'walker-son-slap-ya-mama-cajun-hot', null),
  (3, 'sunshine-skyway', 'Sunshine Skyway Bridge', 75, 'product', 'ass-kickin-habanero-garlic-salt', null),
  (4, 'coronado', 'Coronado Bridge', 75, 'product', 'walker-son-slap-ya-mama-hot-sauce', null),
  (5, 'mackinac', 'Mackinac Bridge', 75, 'product', 'heartbreaking-dawns-the-green', null),
  (6, 'chesapeake-bay', 'Chesapeake Bay Bridge', 100, 'product', 'dirty-dicks-hot-tropical-hot-sauce', null),
  (7, 'new-river-gorge', 'New River Gorge Bridge', 100, 'product', 'sucklebusters-original-bbq', null),
  (8, 'tacoma-narrows', 'Tacoma Narrows Bridge', 100, 'discount', null, 10),
  (9, 'zakim-bunker-hill', 'Zakim Bunker Hill Bridge', 125, 'product', 'sauce-crafters-colon-cleaner-mustard', null),
  (10, 'verrazzano-narrows', 'Verrazzano-Narrows Bridge', 150, 'product', 'sucklebusters-hogwaller-14oz', null),
  (11, 'sf-oakland-bay', 'SF-Oakland Bay Bridge', 150, 'discount', null, 15),
  (12, 'george-washington', 'George Washington Bridge', 175, 'product', '2-pig-mafia-steak-seasoning-14oz', null),
  (13, 'brooklyn', 'Brooklyn Bridge', 200, 'product', 'ariston-garlic-infused-olive-oil', null),
  (14, 'lake-pontchartrain', 'Lake Pontchartrain Causeway', 200, 'product', 'ariston-fig-infused-balsamic-vinegar', null),
  (15, 'golden-gate', 'Golden Gate Bridge', 225, 'discount', null, 20)
) as v(token_number,token_key,bridge_label,tier_cost,reward_kind,reward_product_slug,discount_percent);

-- Server-only current balance qualification. Does not assert that any token
-- was earned permanently, nor that any redeemed token may be reacquired.
-- Token exchangeability and redeemed-token visibility await owner decision D01.
create function public.pj_loyalty_balance_qualified_tokens(p_customer_id uuid)
returns table (
 token_number smallint,
 token_key text,
 bridge_label text,
 tier_cost smallint,
 reward_kind text,
 reward_product_slug text,
 discount_percent smallint,
 front_art_path text,
 back_art_path text,
 balance_qualified boolean,
 wallet_balance integer
)
language sql stable security invoker set search_path=pg_catalog,public,pg_temp
as $$
select d.token_number,d.token_key,d.bridge_label,d.tier_cost,d.reward_kind,
 d.reward_product_slug,d.discount_percent,d.front_art_path,d.back_art_path,
 (coalesce(w.balance,0)>=d.tier_cost) as balance_qualified,
 coalesce(w.balance,0) as wallet_balance
from public.customer_profiles c
join public.pj_loyalty_token_definitions d on true
left join public.pj_credit_wallets w on w.customer_id=c.id
where c.id=p_customer_id and c.account_state='verified_matched'
order by d.token_number;
$$;
revoke all on function public.pj_loyalty_balance_qualified_tokens(uuid)
  from public,anon,authenticated;
grant execute on function public.pj_loyalty_balance_qualified_tokens(uuid)
  to service_role;
