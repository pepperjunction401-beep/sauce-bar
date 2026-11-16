-- Review Board evidence reader and idempotent approval event handoff.
-- Testing only; uses Phase 1/2 attached purchase facts. No changes to Badge Engine rules.
create or replace function public.pj_review_board_for_customer(p_customer_id uuid)
returns table(product_slug text, eligible boolean, already_reviewed boolean)
language sql stable security invoker set search_path='' as $$
select pr.cns_slug,
  exists (
    select 1 from public.purchases pu
    join public.purchase_line_items li on li.purchase_id=pu.id
    where pu.customer_id=p_customer_id
      and li.product_id=pr.id
      and pu.purchase_status='completed'
      and pu.import_status='attached'
      and pu.completed_at is not null
      and li.quantity>0 and li.line_total_amount>0
      and coalesce((select sum(refund_amount) from public.purchase_refunds r
        where r.purchase_line_item_id=li.id
          and lower(r.refund_status) in ('completed','approved','succeeded')),0)<li.line_total_amount
      and not exists (
        select 1 from public.purchase_refunds r
        where r.purchase_id=pu.id and r.purchase_line_item_id is null
          and lower(r.refund_status) in ('completed','approved','succeeded')
          and r.refund_amount>=pu.total_amount)
  ) as eligible,
  exists(
    select 1 from public.pj_review_submissions rv
    where rv.customer_id=p_customer_id and rv.product_id=pr.id
  ) as already_reviewed
from public.pj_products pr
where exists (
 select 1 from public.customer_profiles c
 where c.id=p_customer_id and c.account_state='verified_matched'
)
order by pr.cns_slug;
$$;
revoke all on function public.pj_review_board_for_customer(uuid) from public,anon,authenticated;
grant execute on function public.pj_review_board_for_customer(uuid) to service_role;

-- Approved original reviews emit an immutable, exactly-once event for the separate Badge Engine.
-- This is an interface, not an independent badge awarding engine.
create table public.pj_review_approval_events (
 review_id uuid primary key references public.pj_review_submissions(id),
 customer_id uuid not null references public.customer_profiles(id),
 product_id uuid not null references public.pj_products(id),
 approved_at timestamptz not null default now(),
 constraint pj_review_approval_one_product unique(customer_id,product_id)
);
alter table public.pj_review_approval_events enable row level security;
revoke all on public.pj_review_approval_events from public,anon,authenticated;
comment on table public.pj_review_approval_events is
 'Immutable one-time approved-review events; intended for Phase 3 Review Badge Engine subscriber. Does not itself award badges.';
create or replace function public.pj_review_emit_approval_event()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.moderation_status='approved'
    and old.moderation_status is distinct from 'approved' then
    insert into public.pj_review_approval_events(review_id,customer_id,product_id)
    values(new.id,new.customer_id,new.product_id)
    on conflict do nothing;
 end if;
 return new;
end;
$$;
revoke execute on function public.pj_review_emit_approval_event() from public,anon,authenticated;
drop trigger if exists pj_review_first_approval_event on public.pj_review_submissions;
create trigger pj_review_first_approval_event
after update of moderation_status on public.pj_review_submissions
for each row execute function public.pj_review_emit_approval_event();
