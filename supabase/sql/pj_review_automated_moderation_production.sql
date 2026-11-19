-- Pepper Junction automated public-review moderation, approved production deployment 2026-11-19; originally validated in Dev/Testing.
-- Only q15 is public; q14 remains private and need not be moderated.
-- Caller auth and owner authorization are enforced by the Edge Function.
-- These RPCs are executable by service_role ONLY (not anon/authenticated).
alter table public.pj_review_submissions
  add column if not exists moderation_reason text,
  add column if not exists moderation_decided_at timestamptz;

create table if not exists public.pj_review_moderation_cases (
 review_id uuid primary key references public.pj_review_submissions(id) on delete cascade,
 reason text not null,
 created_at timestamptz not null default now(),
 notification_sent_at timestamptz,
 notification_attempts integer not null default 0,
 last_notification_error text
);
alter table public.pj_review_moderation_cases enable row level security;
revoke all on public.pj_review_moderation_cases from public,anon,authenticated;

create table if not exists public.pj_review_moderation_audit (
 id uuid primary key default gen_random_uuid(),
 review_id uuid not null references public.pj_review_submissions(id),
 owner_user_id uuid not null,
 action text not null check(action in ('approved','rejected')),
 reason text,
 decided_at timestamptz not null default now()
);
alter table public.pj_review_moderation_audit enable row level security;
revoke all on public.pj_review_moderation_audit from public,anon,authenticated;

create or replace function public.pj_review_apply_moderation(
 p_review_id uuid, p_status text, p_reason text default null)
returns boolean language plpgsql security invoker set search_path = ''
as $$
declare v_changed uuid;
begin
 if p_status not in ('approved','frozen') then
   raise exception 'INVALID_MODERATION' using errcode='22023';
 end if;
 if p_status='frozen' and nullif(trim(p_reason),'') is null then
   raise exception 'FLAG_REASON_REQUIRED' using errcode='22023';
 end if;
 update public.pj_review_submissions
 set moderation_status=p_status,
     moderation_reason=case when p_status='frozen' then left(p_reason,200) else null end,
     moderation_decided_at=now(),
     public_q15=case when p_status='approved' then q15_original else null end
 where id=p_review_id and moderation_status='pending'
 returning id into v_changed;
 if v_changed is null then return false; end if;
 if p_status='frozen' then
   insert into public.pj_review_moderation_cases(review_id,reason)
   values(v_changed,left(p_reason,200)) on conflict(review_id) do nothing;
 end if;
 return true;
end; $$;
revoke all on function public.pj_review_apply_moderation(uuid,text,text) from public,anon,authenticated;
grant execute on function public.pj_review_apply_moderation(uuid,text,text) to service_role;

create or replace function public.pj_review_owner_moderation_decision(
 p_review_id uuid, p_owner_id uuid, p_decision text)
returns boolean language plpgsql security invoker set search_path = ''
as $$
declare v_record record;
begin
 if p_owner_id is null or p_decision not in ('approved','rejected') then
   raise exception 'INVALID_DECISION' using errcode='22023';
 end if;
 select moderation_status,q15_original into v_record
 from public.pj_review_submissions where id=p_review_id for update;
 if not found or v_record.moderation_status<>'frozen' then return false; end if;
 update public.pj_review_submissions set moderation_status=p_decision,
   moderation_reason=null,moderation_decided_at=now(),
   public_q15=case when p_decision='approved' then q15_original else null end
 where id=p_review_id and moderation_status='frozen';
 insert into public.pj_review_moderation_audit(review_id,owner_user_id,action)
 values(p_review_id,p_owner_id,p_decision);
 return true;
end; $$;
revoke all on function public.pj_review_owner_moderation_decision(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.pj_review_owner_moderation_decision(uuid,uuid,text) to service_role;
