-- Review Yard v2.2 — additive private journal, answers, and bottle log.
-- Testing first. Never rewrite original review, purchases, rewards, or badge facts.
alter table public.pj_review_private_notes
  add column if not exists answers_now jsonb not null default '{}'::jsonb,
  add column if not exists journal_notes text not null default '';

alter table public.pj_review_private_notes
  add constraint pj_ry_journal_2000 check (char_length(journal_notes) <= 2000),
  add constraint pj_ry_answers_shape check (
    jsonb_typeof(answers_now) = 'object'
    and octet_length(answers_now::text) <= 8000
    and (answers_now - array['q7','q8','q9','q10','q11','q12','q13','q16','q17']) = '{}'::jsonb
  );

create table if not exists public.pj_review_bottle_log (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references public.customer_profiles(id) on delete restrict,
 purchase_line_item_id uuid not null references public.purchase_line_items(id) on delete restrict,
 bottle_ordinal integer not null check (bottle_ordinal > 0),
 purpose text check (purpose in ('for_me','gift')),
 opened_on date,
 finished_on date,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (purchase_line_item_id,bottle_ordinal),
 constraint pj_ry_bottle_dates check (
   (opened_on is null or opened_on <= current_date)
   and (finished_on is null or finished_on <= current_date)
   and (finished_on is null or (opened_on is not null and finished_on >= opened_on))
   and (purpose is distinct from 'gift' or (opened_on is null and finished_on is null))
 )
);
create index if not exists pj_ry_bottle_log_owner on public.pj_review_bottle_log(customer_id,purchase_line_item_id);
alter table public.pj_review_bottle_log enable row level security;
-- All bottle access is exclusively via authenticated, owner-scoped Edge Function.
revoke all on public.pj_review_bottle_log from public, anon, authenticated;
grant select,insert,update,delete on public.pj_review_bottle_log to service_role;

create or replace function public.pj_review_yard_save(
  p_customer_id uuid,
  p_review_id uuid,
  p_answers_now jsonb,
  p_journal_notes text,
  p_bottles jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
 v_product uuid;
 v_item jsonb;
 v_item_id uuid;
 v_ordinal int;
 v_quantity numeric;
 v_order_customer uuid;
 v_order_date date;
 v_item_product uuid;
 v_purpose text;
 v_opened date;
 v_finished date;
 v_seen text[] := '{}'::text[];
 v_key text;
 v_text text;
begin
 if p_customer_id is null or p_review_id is null then raise exception 'INVALID_REVIEW' using errcode='22023'; end if;
 select product_id into v_product from public.pj_review_submissions
   where id=p_review_id and customer_id=p_customer_id;
 if not found then raise exception 'REVIEW_NOT_FOUND' using errcode='22023'; end if;
 if p_answers_now is null or jsonb_typeof(p_answers_now)<>'object'
   or octet_length(p_answers_now::text)>8000
   or (p_answers_now-array['q7','q8','q9','q10','q11','q12','q13','q16','q17'])<>'{}'::jsonb
 then raise exception 'INVALID_PRIVATE_ANSWERS' using errcode='22023'; end if;
 if p_journal_notes is null or char_length(p_journal_notes)>2000 then
   raise exception 'INVALID_JOURNAL' using errcode='22023';
 end if;
 if p_bottles is null or jsonb_typeof(p_bottles)<>'array' or jsonb_array_length(p_bottles)>200
 then raise exception 'INVALID_BOTTLES' using errcode='22023'; end if;

 update public.pj_review_private_notes set
   answers_now=p_answers_now, journal_notes=p_journal_notes, updated_at=now()
 where review_id=p_review_id and customer_id=p_customer_id and product_id=v_product;
 if not found then raise exception 'PRIVATE_ROW_NOT_FOUND' using errcode='22023'; end if;

 for v_item in select value from jsonb_array_elements(p_bottles) loop
   if jsonb_typeof(v_item)<>'object' or
     coalesce(v_item->>'purchase_line_item_id','') !~ '^[0-9a-fA-F-]{36}$' or
     coalesce(v_item->>'bottle_ordinal','') !~ '^[1-9][0-9]{0,5}$'
   then raise exception 'INVALID_BOTTLE_ID' using errcode='22023'; end if;
   v_item_id := (v_item->>'purchase_line_item_id')::uuid;
   v_ordinal := (v_item->>'bottle_ordinal')::integer;
   v_key := v_item_id::text||':'||v_ordinal::text;
   if v_key=any(v_seen) then raise exception 'DUPLICATE_BOTTLE' using errcode='22023'; end if;
   v_seen:=array_append(v_seen,v_key);

   select li.quantity,li.product_id,p.customer_id,
          coalesce(p.completed_at,p.square_created_at,p.created_at)::date
     into v_quantity,v_item_product,v_order_customer,v_order_date
   from public.purchase_line_items li
   join public.purchases p on p.id=li.purchase_id
   where li.id=v_item_id;
   if not found or v_order_customer is distinct from p_customer_id or
      v_item_product is distinct from v_product or
      v_quantity<>trunc(v_quantity) or v_quantity<1 or v_ordinal>v_quantity then
     raise exception 'BOTTLE_NOT_OWNED' using errcode='22023';
   end if;

   v_purpose:=nullif(v_item->>'purpose','');
   if v_purpose is not null and v_purpose not in ('for_me','gift') then
     raise exception 'INVALID_PURPOSE' using errcode='22023'; end if;

   v_text:=nullif(v_item->>'opened_on','');
   if v_text is not null and v_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
     raise exception 'INVALID_OPENED' using errcode='22023'; end if;
   v_opened:=v_text::date;
   v_text:=nullif(v_item->>'finished_on','');
   if v_text is not null and v_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
     raise exception 'INVALID_FINISHED' using errcode='22023'; end if;
   v_finished:=v_text::date;
   if (v_opened is not null and (v_opened<v_order_date or v_opened>current_date))
      or (v_finished is not null and (v_opened is null or v_finished<v_opened or v_finished>current_date))
      or (v_purpose is distinct from 'for_me' and (v_opened is not null or v_finished is not null))
   then raise exception 'INVALID_BOTTLE_DATES' using errcode='22023'; end if;

   if v_purpose is null and v_opened is null and v_finished is null then
     delete from public.pj_review_bottle_log
      where customer_id=p_customer_id and purchase_line_item_id=v_item_id and bottle_ordinal=v_ordinal;
   else
     insert into public.pj_review_bottle_log
       (customer_id,purchase_line_item_id,bottle_ordinal,purpose,opened_on,finished_on)
       values(p_customer_id,v_item_id,v_ordinal,v_purpose,v_opened,v_finished)
     on conflict (purchase_line_item_id,bottle_ordinal)
     do update set purpose=excluded.purpose,opened_on=excluded.opened_on,
       finished_on=excluded.finished_on,updated_at=now()
     where pj_review_bottle_log.customer_id=excluded.customer_id;
     if not found then raise exception 'BOTTLE_OWNERSHIP_CONFLICT' using errcode='22023'; end if;
   end if;
 end loop;
 return jsonb_build_object('ok',true);
end
$fn$;
revoke all on function public.pj_review_yard_save(uuid,uuid,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.pj_review_yard_save(uuid,uuid,jsonb,text,jsonb) to service_role;
