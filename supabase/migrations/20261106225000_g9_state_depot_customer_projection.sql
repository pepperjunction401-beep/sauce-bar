-- G9 Stage D: customer-owned, read-only State Badge Depot projection.
-- Sauce-Bar-Dev / isolated Supabase Testing only until separately authorized.
-- Existing G9 purchase evaluation, awards, Square, Railroad, and other families stay unchanged.
--
-- Security: table grants remain private; authenticated consumers may execute only this
-- parameter-free, identity-scoped function. No unearned secret metadata is returned.

create function public.pj_state_my_collection()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $fn$
declare
  v_customer_id uuid := auth.uid();
  v_states jsonb := '[]'::jsonb;
  v_earned_divisions jsonb := '[]'::jsonb;
begin
  if v_customer_id is null then
    raise exception 'G9_STATE_AUTH_REQUIRED' using errcode='28000';
  end if;

  if not exists (
    select 1 from public.customer_profiles c
    where c.id=v_customer_id and c.account_state='verified_matched'
  ) then
    return jsonb_build_object(
      'status','identity_not_verified',
      'states','[]'::jsonb,
      'earned_divisions','[]'::jsonb
    );
  end if;

  -- State levels are already adjudicated by Phase 3. Never infer eligibility
  -- from product, shipping, or Square data in this presentation projection.
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'state_code',l.state_code,
      'level',l.level,
      'art_path',s.art_path
    ) order by s.state_name
  ),'[]'::jsonb)
  into v_states
  from public.pj_state_customer_levels l
  join public.pj_state_registry s on s.state_code=l.state_code
  where l.customer_id=v_customer_id and l.level>0;

  -- Strict earned-only return: do NOT send the division registry, future
  -- achievements, progress counters, or unearned secret titles to the client.
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'division_code',a.division_code,
      'division_name',d.division_name,
      'earned_at',a.earned_at
    ) order by d.division_name
  ),'[]'::jsonb)
  into v_earned_divisions
  from public.pj_state_secret_awards a
  join public.pj_state_divisions d on d.division_code=a.division_code
  where a.customer_id=v_customer_id;

  return jsonb_build_object(
    'status','verified',
    'states',v_states,
    'earned_divisions',v_earned_divisions
  );
end;
$fn$;

-- PostgreSQL EXECUTE defaults to PUBLIC; explicitly restrict this definer
-- function, so anonymous callers and unrelated signed-in accounts cannot
-- enumerate another customer's awards.
revoke all on function public.pj_state_my_collection()
  from public, anon, authenticated;
grant execute on function public.pj_state_my_collection()
  to authenticated, service_role;
