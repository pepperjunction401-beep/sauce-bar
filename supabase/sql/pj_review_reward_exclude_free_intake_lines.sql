-- Pepper Junction Review Board — Supabase Testing only.
-- Suppress ONLY the matched zero-dollar complimentary line from the two
-- existing purchase-based award intake streams. Preserve paid lines.
-- The Square order must already be recorded as an active/verified reward checkout.
create table public.pj_review_reward_excluded_lines (
 purchase_id uuid not null references public.purchases(id) on delete cascade,
 square_line_item_uid text not null,
 customer_id uuid not null references public.customer_profiles(id),
 row_number integer not null,
 product_id uuid not null references public.pj_products(id),
 excluded_at timestamptz not null default now(),
 primary key (purchase_id,square_line_item_uid)
);
create index pj_review_reward_excluded_lines_customer_idx
 on public.pj_review_reward_excluded_lines(customer_id,row_number);
alter table public.pj_review_reward_excluded_lines enable row level security;
revoke all on public.pj_review_reward_excluded_lines from anon,authenticated;
grant select,insert on public.pj_review_reward_excluded_lines to service_role;

create function public.pj_review_reward_exclude_purchase_line()
returns trigger language plpgsql security invoker set search_path to ''
as $fn$
declare v_customer uuid; v_row integer;
begin
 if new.line_total_amount<>0 or new.quantity<>1 then return new; end if;
 select a.customer_id,a.row_number into v_customer,v_row
 from public.purchases p
 join public.pj_review_reward_checkout_attempts a
  on a.square_order_id=p.square_order_id and a.customer_id=p.customer_id
 join public.pj_review_reward_entitlements e
  on e.customer_id=a.customer_id and e.row_number=a.row_number
 where p.id=new.purchase_id and a.selected_product_id=new.product_id
  and e.selected_product_id=new.product_id
  and a.state in ('opened','paid_verified')
  and e.status in ('selected','redeemed')
 limit 1;
 if not found then return new; end if;
 insert into public.pj_review_reward_excluded_lines
 (purchase_id,square_line_item_uid,customer_id,row_number,product_id)
 values(new.purchase_id,new.square_line_item_uid,v_customer,v_row,new.product_id)
 on conflict do nothing;
 return null;
end
$fn$;
revoke all on function public.pj_review_reward_exclude_purchase_line() from public,anon,authenticated;
create trigger pj_review_reward_skip_zero_line
before insert on public.purchase_line_items
for each row execute function public.pj_review_reward_exclude_purchase_line();

create function public.pj_review_reward_exclude_passenger_evidence()
returns trigger language plpgsql security invoker set search_path to ''
as $fn$
begin
 if new.gross_line_cents=0 and exists(
  select 1 from public.pj_review_reward_excluded_lines x
  where x.purchase_id=new.purchase_id and x.square_line_item_uid=new.square_line_uid
 ) then return null; end if;
 return new;
end
$fn$;
revoke all on function public.pj_review_reward_exclude_passenger_evidence() from public,anon,authenticated;
create trigger pj_review_reward_skip_passenger_evidence
before insert on public.pj_passenger_merchandise_evidence
for each row execute function public.pj_review_reward_exclude_passenger_evidence();
