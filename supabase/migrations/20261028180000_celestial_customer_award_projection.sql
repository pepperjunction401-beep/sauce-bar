-- Customer-safe read model for the existing Celestial award ledger.
-- Never expose purchase identifiers, timezone evidence, evaluation events, or secrets.
create or replace function public.pj_celestial_my_earned_months()
returns table (edition_year integer, month_number smallint)
language sql stable security definer
set search_path=public,pg_temp
as $$
  select a.edition_year,a.month_number
  from public.pj_celestial_awards a
  where auth.uid() is not null
    and a.customer_id=auth.uid()
  order by a.edition_year,a.month_number
$$;
revoke all on function public.pj_celestial_my_earned_months() from public,anon;
grant execute on function public.pj_celestial_my_earned_months() to authenticated;
