-- CNS eligibility snapshot for Milestone; category codes are authoritative.
-- Existing or future products are matched by CNS slug, never inferred by heat.
with eligible(slug,category) as (values
('13-stars-dragons-breath','HOT SAUCE'),
('cajohns-la-segadora-carolina-reaper','HOT SAUCE'),
('dirty-dicks-hot-tropical-hot-sauce','HOT SAUCE'),
('ghost-scream','HOT SAUCE'),
('heartbreaking-dawns-the-green','HOT SAUCE'),
('high-river-sauces-hellacious','HOT SAUCE'),
('high-river-sauces-psych-sauce','HOT SAUCE'),
('high-river-sauces-foo-foo-mama-choo','HOT SAUCE'),
('high-river-sauces-peppers-up','HOT SAUCE'),
('high-river-sauces-rogue','HOT SAUCE'),
('high-river-sauces-tears-of-the-sun','HOT SAUCE'),
('high-river-sauces-thunder-juice','HOT SAUCE'),
('high-river-sauces-taco-x','HOT SAUCE'),
('hells-kitchen-cinnamon-ghost','HOT SAUCE'),
('hells-kitchen-coconut-curry','HOT SAUCE'),
('hells-kitchen-black-forest','HOT SAUCE'),
('hells-kitchen-black-westside-red','HOT SAUCE'),
('sauce-crafters-hogs-ass-garlic-habanero-sauce','HOT SAUCE'),
('ashley-foods-mad-dog-sriracha','HOT SAUCE'),
('melindas-mango-habanero','HOT SAUCE'),
('melindas-original-naga-jolokia','HOT SAUCE'),
('melindas-scotch-bonnet-sauce','HOT SAUCE'),
('mikey-vs-i-love-taco-sauce-hot','HOT SAUCE'),
('mikey-vs-jalapeno-dill-pickle','HOT SAUCE'),
('mikey-vs-reaper-jalapeno-dill-pickle','HOT SAUCE'),
('mikey-vs-ghostly-garlic','HOT SAUCE'),
('sauce-crafters-mountain-man-fire-roasted-habanero','HOT SAUCE'),
('sauce-leopard-road-dawg-red-chili-garlic','HOT SAUCE'),
('puckerbutt-puckerbutt-gator-sauce','HOT SAUCE'),
('rheds-deja-vu','HOT SAUCE'),
('rheds-lemon-drop','HOT SAUCE'),
('rheds-original','HOT SAUCE'),
('stanky-sauce-clasico','HOT SAUCE'),
('walker-son-slap-ya-mama-hot-sauce','HOT SAUCE'),
('defcon-curbstomp','WING SAUCE'),
('defcon-cluckwing','WING SAUCE'),
('defcon-condition-2','WING SAUCE'),
('defcon-condition-3','WING SAUCE')
)
insert into public.pj_milestone_qualifying_products(product_id,cns_slug,qualifying_category,evidence_source)
select p.id,p.cns_slug,e.category,'cns_category'
from public.pj_products p join eligible e on e.slug=p.cns_slug
on conflict(product_id) do update set cns_slug=excluded.cns_slug,qualifying_category=excluded.qualifying_category;
