create or replace function public.pj_passenger_my_tokens()
returns table(token_code text, earned_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
select a.token_code,a.earned_at from public.pj_passenger_token_awards a
where a.customer_id=auth.uid() order by a.earned_at,a.token_code
$$;
revoke all on function public.pj_passenger_my_tokens() from public,anon;
grant execute on function public.pj_passenger_my_tokens() to authenticated;