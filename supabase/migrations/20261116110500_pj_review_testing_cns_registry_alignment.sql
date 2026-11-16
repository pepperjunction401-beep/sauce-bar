-- Complete only the two currently missing Phase 2 CNS/Square registrations in Testing.
-- Supabase Production remains unchanged. No competing catalog is created.
WITH source(cns_slug,square_token) AS (
 VALUES ('stanky-honey-mango-habanero','2ZGVC2JH7X6IYR3EUM6TWDIJ'),
('sweet-gs-smoked-cheddar-pretzels-spicy','RHZDTMSOCHUM5FSOPSLNBLDN')
), registered AS (
 INSERT INTO public.pj_products(cns_slug,is_active)
 SELECT cns_slug,true FROM source
 ON CONFLICT(cns_slug) DO UPDATE SET is_active=true
 RETURNING id,cns_slug
)
INSERT INTO public.square_product_mappings(product_id,square_item_library_token)
SELECT r.id,s.square_token FROM registered r JOIN source s USING(cns_slug)
ON CONFLICT(product_id) DO UPDATE
SET square_item_library_token=excluded.square_item_library_token,updated_at=now();
