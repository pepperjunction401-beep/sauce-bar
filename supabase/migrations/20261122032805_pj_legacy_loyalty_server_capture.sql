-- Restricted, server-side Square capture. No customer records enter browser storage.
create table public.pj_loyalty_capture_control (
 singleton boolean primary key default true check(singleton),
 capture_enabled boolean not null default false
);
insert into public.pj_loyalty_capture_control(singleton) values(true);
create table public.pj_loyalty_capture_runs (
 id uuid primary key default gen_random_uuid(),
 source_program_id text not null check(length(source_program_id) between 1 and 128),
 api_version text not null,
 started_at timestamptz not null default now(),
 completed_at timestamptz,
 state text not null default 'capturing' check(state in ('capturing','captured','staged','sealed')),
 snapshot_id uuid unique references public.pj_legacy_loyalty_snapshots(id),
 check ((state='capturing' and completed_at is null) or (state<>'capturing' and completed_at is not null))
);
create unique index pj_loyalty_one_server_capture on public.pj_loyalty_capture_runs((true));
create table public.pj_loyalty_capture_pages (
 run_id uuid not null references public.pj_loyalty_capture_runs(id) on delete restrict,
 stream text not null check(stream in ('accounts','events','rewards')),
 page_number integer not null check(page_number>0),
 requested_cursor text,
 next_cursor text,
 received_at timestamptz not null default now(),
 record_count integer not null check(record_count between 0 and 200),
 response jsonb not null check(jsonb_typeof(response)='object'),
 response_sha256 text not null check(response_sha256 ~ '^[0-9a-f]{64}$'),
 primary key(run_id,stream,page_number),
 check(next_cursor is null or (length(next_cursor)>0 and next_cursor is distinct from requested_cursor))
);
create unique index pj_loyalty_capture_unique_cursor
 on public.pj_loyalty_capture_pages(run_id,stream,next_cursor) where next_cursor is not null;
alter table public.pj_loyalty_capture_control enable row level security;
alter table public.pj_loyalty_capture_runs enable row level security;
alter table public.pj_loyalty_capture_pages enable row level security;
revoke all on public.pj_loyalty_capture_control,public.pj_loyalty_capture_runs,public.pj_loyalty_capture_pages from public,anon,authenticated,service_role;
grant select on public.pj_loyalty_capture_control to service_role;
grant select,insert,update on public.pj_loyalty_capture_runs to service_role;
grant select,insert on public.pj_loyalty_capture_pages to service_role;

create function public.pj_loyalty_capture_append_page(
 p_run uuid,p_stream text,p_requested_cursor text,p_response jsonb,p_sha256 text
) returns jsonb language plpgsql set search_path='' as $function$
declare r record; prev record; k text; n integer; nxt text; lim integer; last_page integer;
begin
 if not exists(select 1 from public.pj_loyalty_capture_control where singleton and capture_enabled)
 then raise exception 'PJ_CAPTURE_DISABLED';end if;
 select * into r from public.pj_loyalty_capture_runs where id=p_run and state='capturing' for update;
 if not found then raise exception 'PJ_CAPTURE_RUN_NOT_OPEN';end if;
 k:=case p_stream when 'accounts' then 'loyalty_accounts' when 'events' then 'events' when 'rewards' then 'rewards' end;
 lim:=case when p_stream='accounts' then 200 else 30 end;
 if k is null or jsonb_typeof(p_response) is distinct from 'object'
    or jsonb_typeof(p_response->k) is distinct from 'array'
    or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$'
 then raise exception 'PJ_CAPTURE_INVALID_PAGE';end if;
 n:=jsonb_array_length(p_response->k);
 if n>lim or exists(select 1 from jsonb_array_elements(p_response->k) a
 where jsonb_typeof(a) is distinct from 'object' or nullif(btrim(a->>'id'),'') is null)
 then raise exception 'PJ_CAPTURE_INVALID_RECORD';end if;
 if p_response ? 'cursor' and jsonb_typeof(p_response->'cursor') not in ('null','string')
 then raise exception 'PJ_CAPTURE_INVALID_CURSOR';end if;
 nxt:=nullif(p_response->>'cursor','');
 select * into prev from public.pj_loyalty_capture_pages
 where run_id=p_run and stream=p_stream order by page_number desc limit 1;
 if found then
   if prev.next_cursor is null or prev.next_cursor is distinct from p_requested_cursor then
     raise exception 'PJ_CAPTURE_CHECKPOINT_CHANGED';end if;
   last_page:=prev.page_number;
 else
   if p_requested_cursor is not null then raise exception 'PJ_CAPTURE_FIRST_CURSOR_INVALID';end if;
   last_page:=0;
 end if;
 insert into public.pj_loyalty_capture_pages(run_id,stream,page_number,requested_cursor,next_cursor,record_count,response,response_sha256)
 values(p_run,p_stream,last_page+1,p_requested_cursor,nxt,n,p_response,p_sha256);
 if (select count(*) from public.pj_loyalty_capture_pages where run_id=p_run and next_cursor is null)=3
 then update public.pj_loyalty_capture_runs set state='captured',completed_at=now() where id=p_run;end if;
 return jsonb_build_object('stream',p_stream,'page',last_page+1,'count',n,'complete',nxt is null);
end
$function$;
revoke all on function public.pj_loyalty_capture_append_page(uuid,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.pj_loyalty_capture_append_page(uuid,text,text,jsonb,text) to service_role;
