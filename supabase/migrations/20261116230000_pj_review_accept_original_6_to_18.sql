-- Review System acceptance range, already approved in questionnaire scoring plan.
-- Narrow repair: the table allows 6–18 but the protected insert RPC still allowed 6–12.
-- No changes to customer verification, purchase eligibility, private notes, or review identity.

CREATE OR REPLACE FUNCTION public.pj_review_accept_original(p_customer_id uuid, p_slug text, p_answers jsonb, p_points integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_status jsonb;
  v_product_id uuid;
  v_review_id uuid;
  v_purchase_id uuid;
begin
  if p_customer_id is null or p_slug is null or p_answers is null
    or p_points not between 6 and 18 then
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
end $function$

