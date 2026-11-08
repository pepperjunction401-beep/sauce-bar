-- Pepper Junction G9 / State Entry Badges / Phase 3 foundation (Dev + isolated Testing).
-- Owner-authorized Stages A-C only. No customer presentation, no Main/Production.
-- Source: existing Phase 1 verified customer + Phase 2 accepted purchases.
-- Critical separation: the purchase trigger ONLY enqueues; evaluation occurs in
-- a separate worker transaction. Trigger failures are contained and reported.
-- Recovery reconciler can requeue missed work without rewriting Square truth.

create table public.pj_state_divisions (
  division_code text primary key,
  division_name text not null unique,
  census_region text not null check (census_region in ('Northeast','Midwest','South','West')),
  required_state_count smallint not null check (required_state_count between 1 and 50)
);
insert into public.pj_state_divisions values
 ('new_england','New England','Northeast',6),
 ('middle_atlantic','Middle Atlantic','Northeast',3),
 ('east_north_central','East North Central','Midwest',5),
 ('west_north_central','West North Central','Midwest',7),
 ('south_atlantic','South Atlantic','South',8),
 ('east_south_central','East South Central','South',4),
 ('west_south_central','West South Central','South',4),
 ('mountain','Mountain','West',8),
 ('pacific','Pacific','West',5);

create table public.pj_state_registry (
 state_code text primary key check (state_code ~ '^[A-Z]{2}$'),
 state_name text not null unique,
 division_code text not null references public.pj_state_divisions(division_code),
 art_path text not null unique
);
insert into public.pj_state_registry(state_code,state_name,division_code,art_path) values
  ('CT','Connecticut','new_england','assets/badges/states/badges-states-connecticut.png'),
  ('ME','Maine','new_england','assets/badges/states/badges-states-maine.png'),
  ('MA','Massachusetts','new_england','assets/badges/states/badges-states-massachusetts.png'),
  ('NH','New Hampshire','new_england','assets/badges/states/badges-states-new-hampshire.png'),
  ('RI','Rhode Island','new_england','assets/badges/states/badges-states-rhode-island.png'),
  ('VT','Vermont','new_england','assets/badges/states/badges-states-vermont.png'),
  ('NJ','New Jersey','middle_atlantic','assets/badges/states/badges-states-new-jersey.png'),
  ('NY','New York','middle_atlantic','assets/badges/states/badges-states-new-york.png'),
  ('PA','Pennsylvania','middle_atlantic','assets/badges/states/badges-states-pennsylvania.png'),
  ('IL','Illinois','east_north_central','assets/badges/states/badges-states-illinois.png'),
  ('IN','Indiana','east_north_central','assets/badges/states/badges-states-indiana.png'),
  ('MI','Michigan','east_north_central','assets/badges/states/badges-states-michigan.png'),
  ('OH','Ohio','east_north_central','assets/badges/states/badges-states-ohio.png'),
  ('WI','Wisconsin','east_north_central','assets/badges/states/badges-states-wisconsin.png'),
  ('IA','Iowa','west_north_central','assets/badges/states/badges-states-iowa.png'),
  ('KS','Kansas','west_north_central','assets/badges/states/badges-states-kansas.png'),
  ('MN','Minnesota','west_north_central','assets/badges/states/badges-states-minnesota.png'),
  ('MO','Missouri','west_north_central','assets/badges/states/badges-states-missouri.png'),
  ('NE','Nebraska','west_north_central','assets/badges/states/badges-states-nebraska.png'),
  ('ND','North Dakota','west_north_central','assets/badges/states/badges-states-north-dakota.png'),
  ('SD','South Dakota','west_north_central','assets/badges/states/badges-states-south-dakota.png'),
  ('DE','Delaware','south_atlantic','assets/badges/states/badges-states-delaware.png'),
  ('FL','Florida','south_atlantic','assets/badges/states/badges-states-florida.png'),
  ('GA','Georgia','south_atlantic','assets/badges/states/badges-states-georgia.png'),
  ('MD','Maryland','south_atlantic','assets/badges/states/badges-states-maryland.png'),
  ('NC','North Carolina','south_atlantic','assets/badges/states/badges-states-north-carolina.png'),
  ('SC','South Carolina','south_atlantic','assets/badges/states/badges-states-south-carolina.png'),
  ('VA','Virginia','south_atlantic','assets/badges/states/badges-states-virginia.png'),
  ('WV','West Virginia','south_atlantic','assets/badges/states/badges-states-west-virginia.png'),
  ('AL','Alabama','east_south_central','assets/badges/states/badges-states-alabama.png'),
  ('KY','Kentucky','east_south_central','assets/badges/states/badges-states-kentucky.png'),
  ('MS','Mississippi','east_south_central','assets/badges/states/badges-states-mississippi.png'),
  ('TN','Tennessee','east_south_central','assets/badges/states/badges-states-tennesee.png'),
  ('AR','Arkansas','west_south_central','assets/badges/states/badges-states-arkansas.png'),
  ('LA','Louisiana','west_south_central','assets/badges/states/badges-states-louisiana.png'),
  ('OK','Oklahoma','west_south_central','assets/badges/states/badges-states-oklahoma.png'),
  ('TX','Texas','west_south_central','assets/badges/states/badges-states-texas.png'),
  ('AZ','Arizona','mountain','assets/badges/states/badges-states-arizona.png'),
  ('CO','Colorado','mountain','assets/badges/states/badges-states-colorado.png'),
  ('ID','Idaho','mountain','assets/badges/states/badges-states-idaho.png'),
  ('MT','Montana','mountain','assets/badges/states/badges-states-montana.png'),
  ('NV','Nevada','mountain','assets/badges/states/badges-states-nevada.png'),
  ('NM','New Mexico','mountain','assets/badges/states/badges-states-new-mexico.png'),
  ('UT','Utah','mountain','assets/badges/states/badges-states-utah.png'),
  ('WY','Wyoming','mountain','assets/badges/states/badges-states-wyoming.png'),
  ('AK','Alaska','pacific','assets/badges/states/badges-states-alaska.png'),
  ('CA','California','pacific','assets/badges/states/badges-states-california.png'),
  ('HI','Hawaii','pacific','assets/badges/states/badges-states-hawaii.png'),
  ('OR','Oregon','pacific','assets/badges/states/badges-states-oregon.png'),
  ('WA','Washington','pacific','assets/badges/states/badges-states-washington.png');

create table public.pj_state_evaluation_queue (
 purchase_id uuid primary key references public.purchases(id) on delete restrict,
 status text not null default 'pending'
   check (status in ('pending','held','failed','done')),
 attempts integer not null default 0 check (attempts >= 0),
 next_attempt_at timestamptz not null default now(),
 result text,
 last_error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index pj_state_queue_due_idx
 on public.pj_state_evaluation_queue(next_attempt_at,purchase_id)
 where status in ('pending','failed');

create table public.pj_state_purchase_credits (
 purchase_id uuid primary key references public.purchases(id) on delete restrict,
 customer_id uuid not null references public.customer_profiles(id) on delete restrict,
 state_code text not null references public.pj_state_registry(state_code),
 completed_at timestamptz not null,
 awarded_level integer not null check (awarded_level > 0),
 rules_version text not null,
 awarded_at timestamptz not null default now()
);
create index pj_state_credits_customer_idx
 on public.pj_state_purchase_credits(customer_id,state_code,completed_at);

create table public.pj_state_customer_levels (
 customer_id uuid not null references public.customer_profiles(id) on delete restrict,
 state_code text not null references public.pj_state_registry(state_code),
 level integer not null check (level > 0),
 first_earned_at timestamptz not null,
 last_leveled_at timestamptz not null,
 primary key(customer_id,state_code)
);

-- Secret definitions and customer records have no browser-facing permissions.
create table public.pj_state_secret_awards (
 customer_id uuid not null references public.customer_profiles(id) on delete restrict,
 division_code text not null references public.pj_state_divisions(division_code),
 source_purchase_id uuid not null references public.pj_state_purchase_credits(purchase_id),
 rules_version text not null,
 earned_at timestamptz not null default now(),
 primary key(customer_id,division_code)
);

-- Deliberately no browser policies: Phase 4 will receive a dedicated
-- authenticated, customer-scoped, earned-secret-only projection in Stage D.
alter table public.pj_state_divisions enable row level security;
alter table public.pj_state_registry enable row level security;
alter table public.pj_state_evaluation_queue enable row level security;
alter table public.pj_state_purchase_credits enable row level security;
alter table public.pj_state_customer_levels enable row level security;
alter table public.pj_state_secret_awards enable row level security;

revoke all on table public.pj_state_divisions,public.pj_state_registry,
 public.pj_state_evaluation_queue,public.pj_state_purchase_credits,
 public.pj_state_customer_levels,public.pj_state_secret_awards
 from public,anon,authenticated;
grant select,insert,update,delete on table public.pj_state_divisions,public.pj_state_registry,
 public.pj_state_evaluation_queue,public.pj_state_purchase_credits,
 public.pj_state_customer_levels,public.pj_state_secret_awards to service_role;

-- This function is internal, never callable from a checkout/browser.
create function public.pj_state_evaluate_purchase(p_purchase_id uuid)
returns text language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $fn$
declare
 v_p record;
 v_state text;
 v_division text;
 v_awarded_level integer;
 v_inserted uuid;
begin
 select p.id,p.customer_id,p.completed_at,p.purchase_status,p.import_status,
        p.destination_region,p.destination_country_code,c.account_state
 into v_p
 from public.purchases p
 left join public.customer_profiles c on c.id=p.customer_id
 where p.id=p_purchase_id;
 if not found then return 'held_missing_purchase'; end if;
 if exists(select 1 from public.pj_state_purchase_credits e
           where e.purchase_id=p_purchase_id)
 then return 'already_credited'; end if;

 if v_p.customer_id is null or v_p.account_state is distinct from 'verified_matched'
    or v_p.import_status is distinct from 'attached'
    or v_p.purchase_status is distinct from 'completed'
    or v_p.completed_at is null
 then return 'held_not_eligible'; end if;

 -- Go-live day is interpreted as a Rhode Island business calendar date.
 if (v_p.completed_at at time zone 'America/New_York')::date < date '2026-10-08'
 then return 'excluded_pre_cutoff'; end if;

 if upper(btrim(coalesce(v_p.destination_country_code,''))) <> 'US'
    or nullif(btrim(v_p.destination_region),'') is null
 then return 'held_no_us_destination'; end if;

 select r.state_code,r.division_code into v_state,v_division
 from public.pj_state_registry r
 where r.state_code=upper(btrim(v_p.destination_region))
    or lower(r.state_name)=lower(btrim(v_p.destination_region))
 limit 1;
 if v_state is null then return 'held_unknown_state'; end if;

 -- Per-customer serialization guarantees correct state levels AND
 -- nine-division completion under concurrent distinct state purchases.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_p.customer_id::text,910926));

 -- A retry for the same purchase must never increment twice.
 insert into public.pj_state_purchase_credits
 (purchase_id,customer_id,state_code,completed_at,awarded_level,rules_version)
 values (v_p.id,v_p.customer_id,v_state,v_p.completed_at,1,'G9-STATE-1.0')
 on conflict(purchase_id) do nothing returning purchase_id into v_inserted;
 if v_inserted is null then return 'already_credited'; end if;

 insert into public.pj_state_customer_levels
 (customer_id,state_code,level,first_earned_at,last_leveled_at)
 values (v_p.customer_id,v_state,1,v_p.completed_at,v_p.completed_at)
 on conflict(customer_id,state_code) do update set
 level=public.pj_state_customer_levels.level+1,
 first_earned_at=least(public.pj_state_customer_levels.first_earned_at,excluded.first_earned_at),
 last_leveled_at=greatest(public.pj_state_customer_levels.last_leveled_at,excluded.last_leveled_at)
 returning level into v_awarded_level;

 update public.pj_state_purchase_credits
 set awarded_level=v_awarded_level where purchase_id=v_p.id;

 -- Only full distinct-state division completion awards a secret.
 insert into public.pj_state_secret_awards
 (customer_id,division_code,source_purchase_id,rules_version)
 select v_p.customer_id,d.division_code,v_p.id,'G9-STATE-1.0'
 from public.pj_state_divisions d
 join public.pj_state_registry s on s.division_code=d.division_code
 left join public.pj_state_customer_levels l
   on l.customer_id=v_p.customer_id and l.state_code=s.state_code
 where d.division_code=v_division
 group by d.division_code,d.required_state_count
 having count(s.state_code)=d.required_state_count
    and count(l.state_code)=d.required_state_count
 on conflict(customer_id,division_code) do nothing;
 return 'credited';
end
$fn$;

-- No award calculation or failure can occur in the accepted purchase transaction.
-- Any queue-write failure is contained; a separate reconciliation routine can
-- discover missed accepted purchases without touching the Railroad.
create function public.pj_state_enqueue_from_purchase()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $fn$
begin
 begin
  insert into public.pj_state_evaluation_queue(purchase_id,status,next_attempt_at)
  values(new.id,'pending',now())
  on conflict(purchase_id) do update set
   status='pending',next_attempt_at=now(),last_error=null,updated_at=now()
  where public.pj_state_evaluation_queue.status <> 'done';
 exception when others then
  raise warning 'State queue enqueue failed (purchase %, SQLSTATE %): %',
    new.id,SQLSTATE,SQLERRM;
 end;
 return new;
end
$fn$;
create trigger pj_state_purchase_enqueue
after insert or update of customer_id,import_status,purchase_status,
  completed_at,destination_region,destination_country_code on public.purchases
for each row execute function public.pj_state_enqueue_from_purchase();

-- Operator-controlled worker. Called OUTSIDE the purchase transaction.
-- Each job is a subtransaction; on failure all partial award writes roll back,
-- while its durable failed queue row remains and can be retried.
create function public.pj_state_process_queue(p_limit integer default 50)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $fn$
declare
 v_job record;
 v_result text;
 v_handled integer:=0;
 v_credited integer:=0;
 v_failed integer:=0;
 v_held integer:=0;
begin
 if p_limit is null or p_limit<1 or p_limit>500
 then raise exception 'State queue batch limit must be 1..500'; end if;

 for v_job in
   select q.purchase_id,q.attempts from public.pj_state_evaluation_queue q
   where q.status in ('pending','failed') and q.next_attempt_at<=now()
   order by q.next_attempt_at,q.purchase_id
   for update skip locked limit p_limit
 loop
  v_handled:=v_handled+1;
  begin
   v_result:=public.pj_state_evaluate_purchase(v_job.purchase_id);
   update public.pj_state_evaluation_queue
     set status=case when v_result like 'held_%' then 'held' else 'done' end,
         result=v_result,attempts=attempts+1,last_error=null,updated_at=now()
     where purchase_id=v_job.purchase_id;
   if v_result='credited' then v_credited:=v_credited+1; end if;
   if v_result like 'held_%' then v_held:=v_held+1; end if;
  exception when others then
   update public.pj_state_evaluation_queue
     set status='failed',attempts=attempts+1,
         next_attempt_at=now()+make_interval(mins=>least(60,(power(2,least(attempts,6)))::integer)),
         last_error=left(SQLSTATE||': '||SQLERRM,500),
         result='evaluation_failed',updated_at=now()
     where purchase_id=v_job.purchase_id;
   v_failed:=v_failed+1;
  end;
 end loop;
 return jsonb_build_object('handled',v_handled,'credited',v_credited,
                           'held',v_held,'failed',v_failed);
end
$fn$;

-- A recoverable queue-write failure cannot be allowed to permanently miss an
-- eligible purchase. Reconcile only via a trusted operator/worker; never run
-- a global catch-up silently in this migration.
create function public.pj_state_reconcile_queue(p_limit integer default 100)
returns integer language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $fn$
declare v_n integer;
begin
 if p_limit is null or p_limit<1 or p_limit>500
 then raise exception 'State reconciliation limit must be 1..500'; end if;
 insert into public.pj_state_evaluation_queue as q
 (purchase_id,status,next_attempt_at)
 select p.id,'pending',now()
 from public.purchases p
 join public.customer_profiles c on c.id=p.customer_id and c.account_state='verified_matched'
 left join public.pj_state_evaluation_queue already on already.purchase_id=p.id
 where p.import_status='attached' and p.purchase_status='completed'
   and p.completed_at is not null
   and (p.completed_at at time zone 'America/New_York')::date>=date '2026-10-08'
   and upper(btrim(coalesce(p.destination_country_code,'')))='US'
   and exists (select 1 from public.pj_state_registry s
      where s.state_code=upper(btrim(coalesce(p.destination_region,'')))
         or lower(s.state_name)=lower(btrim(coalesce(p.destination_region,''))))
   and not exists (select 1 from public.pj_state_purchase_credits e
      where e.purchase_id=p.id)
   and (already.purchase_id is null or already.status='held')
 order by p.completed_at,p.id
 limit p_limit
 on conflict(purchase_id) do update set
  status='pending',next_attempt_at=now(),last_error=null,updated_at=now()
 where q.status='held';
 get diagnostics v_n=row_count;
 return v_n;
end
$fn$;

-- Existing business/payment status and all upstream triggers remain untouched.
revoke all on function public.pj_state_evaluate_purchase(uuid),
 public.pj_state_enqueue_from_purchase(),
 public.pj_state_process_queue(integer),
 public.pj_state_reconcile_queue(integer) from public,anon,authenticated;
grant execute on function public.pj_state_evaluate_purchase(uuid),
 public.pj_state_enqueue_from_purchase(),
 public.pj_state_process_queue(integer),
 public.pj_state_reconcile_queue(integer) to service_role;

-- Guard registry coverage: fail the migration rather than silently ship 48.
do $check$
begin
 if (select count(*) from public.pj_state_registry)<>50
    or (select count(*) from public.pj_state_divisions)<>9
    or exists (
      select 1 from public.pj_state_divisions d
      left join public.pj_state_registry s on s.division_code=d.division_code
      group by d.division_code,d.required_state_count
      having count(s.state_code)<>d.required_state_count
    )
 then raise exception 'G9 registry does not represent 50 states across 9 divisions'; end if;
end
$check$;
