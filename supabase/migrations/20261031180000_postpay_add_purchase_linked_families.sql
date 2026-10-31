-- Authenticated, order-scoped post-payment badge projection. No service-role data exposure.
create or replace function public.pj_postpay_my_order_awards(p_square_order_id text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_order public.purchases%rowtype; v_badges jsonb; v_round jsonb; v_milestone jsonb; v_food jsonb; v_celestial jsonb; v_progress jsonb;
declare v_prior numeric; v_current numeric;
begin
 if auth.uid() is null or p_square_order_id is null then return jsonb_build_object('verified',false); end if;
 select * into v_order from public.purchases
 where square_order_id=p_square_order_id and customer_id=auth.uid()
 and purchase_status='completed' and import_status='attached'
 limit 1;
 if not found then return jsonb_build_object('verified',false); end if;
 select coalesce(jsonb_agg(jsonb_build_object('family','heat','code',badge_code)), '[]'::jsonb)
 into v_badges from public.pj_customer_badge_awards
 where customer_id=auth.uid() and source_purchase_id=v_order.id
 and award_state='earned' and reversed_at is null;
 select coalesce(jsonb_agg(jsonb_build_object('family','round','code',window_code)),'[]'::jsonb)
 into v_round from public.pj_round_clock_award_events
 where customer_id=auth.uid() and purchase_id=v_order.id and reversed_at is null;
 select coalesce(jsonb_agg(jsonb_build_object('family','food','code',f.badge_code,'category',d.food_category,'title',d.badge_title)),'[]'::jsonb)
 into v_food from public.pj_food_badge_level_awards f
 join public.pj_food_badge_definitions d on d.badge_code=f.badge_code
 where f.customer_id=auth.uid() and f.source_purchase_id=v_order.id and f.earned_level>0;
 select coalesce(jsonb_agg(jsonb_build_object('family','celestial','year',a.edition_year,'month',a.month_number)),'[]'::jsonb)
 into v_celestial from public.pj_celestial_awards a
 where a.customer_id=auth.uid() and a.source_purchase_id=v_order.id;
 select coalesce(jsonb_agg(jsonb_build_object('family','purchase_progress','code',e.badge_code,'level',e.earned_level)),'[]'::jsonb)
 into v_progress from public.pj_purchase_progress_award_events e
 where e.customer_id=auth.uid() and e.purchase_id=v_order.id and e.earned_level>0;
 -- Current order's CNS qualified units versus earlier verified orders.
 select coalesce(sum(li.quantity),0) into v_current
 from public.purchase_line_items li
 join public.pj_milestone_qualifying_products q on q.product_id=li.product_id
 where li.purchase_id=v_order.id and li.quantity>0 and li.quantity=trunc(li.quantity);
 select coalesce(sum(li.quantity),0) into v_prior
 from public.purchase_line_items li
 join public.purchases p on p.id=li.purchase_id
 join public.pj_milestone_qualifying_products q on q.product_id=li.product_id
 where p.customer_id=auth.uid() and p.id<>v_order.id
 and p.purchase_status='completed' and p.import_status='attached'
 and (p.completed_at<v_order.completed_at or
 (p.completed_at=v_order.completed_at and p.id<v_order.id))
 and li.quantity>0 and li.quantity=trunc(li.quantity);
 select coalesce(jsonb_agg(jsonb_build_object('family','milestone','threshold',a.threshold)),'[]'::jsonb)
 into v_milestone from public.pj_milestone_tier_awards a
 where a.customer_id=auth.uid() and a.threshold>v_prior
 and a.threshold<=v_prior+v_current;
 return jsonb_build_object('verified',true,'awards',v_badges||v_round||v_milestone||v_food||v_celestial||v_progress,
 'milestone_progress',jsonb_build_object('units_at_purchase',v_prior+v_current));
end $$;
revoke all on function public.pj_postpay_my_order_awards(text) from public,anon;
grant execute on function public.pj_postpay_my_order_awards(text) to authenticated;
