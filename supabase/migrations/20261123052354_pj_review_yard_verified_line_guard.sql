-- Keep saved bottle rows aligned with verified paid merchandise, not refunded/unattached or reward lines.
CREATE OR REPLACE FUNCTION public.pj_review_yard_save(p_customer_id uuid, p_review_id uuid, p_answers_now jsonb, p_journal_notes text, p_bottles jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_product uuid;
 v_food text;
 v_love text;
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
 select product_id,q14_original,q15_original into v_product,v_food,v_love
 from public.pj_review_submissions
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

 insert into public.pj_review_private_notes
 (customer_id,product_id,review_id,food_notes,tasting_notes,answers_now,journal_notes)
 values(p_customer_id,v_product,p_review_id,v_food,v_love,p_answers_now,p_journal_notes)
 on conflict(customer_id,product_id) do update
 set answers_now=excluded.answers_now,journal_notes=excluded.journal_notes,updated_at=now()
 where pj_review_private_notes.review_id=excluded.review_id;
 if not found then raise exception 'PRIVATE_ROW_OWNERSHIP_CONFLICT' using errcode='22023'; end if;

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
   where li.id=v_item_id
     and p.purchase_status='completed'
     and p.import_status='attached'
     and li.line_total_amount>0
     and not exists (
       select 1 from public.pj_review_reward_excluded_lines x
       where x.purchase_id=li.purchase_id and x.square_line_item_uid=li.square_line_item_uid
     );
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
$function$

