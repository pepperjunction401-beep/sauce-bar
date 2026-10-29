-- Customer-scoped, earned-only secret projection (no unearned definitions exposed).
create or replace function public.pj_my_earned_time_secrets()
returns table(secret_code text, edition_year integer)
language sql stable security definer set search_path = public, pg_temp
as $$
 select 'celestial_horse_2026'::text,s.edition_year from public.pj_celestial_secret_awards s
 where auth.uid() is not null and s.customer_id=auth.uid() and s.edition_year=2026
 union all
 select 'round_clock_clocked_out'::text,null::integer from public.pj_round_clock_secret_awards s
 where auth.uid() is not null and s.customer_id=auth.uid();
$$;
revoke all on function public.pj_my_earned_time_secrets() from public, anon;
grant execute on function public.pj_my_earned_time_secrets() to authenticated;