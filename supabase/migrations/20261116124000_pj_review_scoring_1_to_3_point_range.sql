-- Pepper Junction Review System — approved six-question 1–3 point scale.
-- Six required scoring answers yield total raw points in [6, 18].
-- The approved People’s Choice conversion remains anchored to 3–5 stars:
--   unrounded_stars = 3 + ((AVG(approved.points_raw) - 6) / 6)
--   quarter_star = ROUND(unrounded_stars * 4) / 4
-- Average raw points before star conversion; round only at the end.
-- This change only widens the permissible persisted total. Question-specific
-- 1/2/3 mappings await separate owner review of all six slider questions.
-- No scoring answers become editable; purchase/approval rules are unchanged.

alter table public.pj_review_submissions
  drop constraint pj_review_points_range;

alter table public.pj_review_submissions
  add constraint pj_review_points_range check (points_raw between 6 and 18);
