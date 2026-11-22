create or replace function public.pj_loyalty_capture_stage_register(p_run uuid)
returns jsonb language plpgsql set search_path='' as $function$
declare r record; s uuid; archive_hash text; counts jsonb; n integer; bad integer; dup integer;
 total_points numeric; capped_points numeric; issued integer; batch jsonb; result jsonb;
begin
 if not exists(select 1 from public.pj_loyalty_capture_control where singleton and capture_enabled)
 then return jsonb_build_object('status','capture_disabled');end if;
 select * into r from public.pj_loyalty_capture_runs where id=p_run for update;
 if not found then return jsonb_build_object('status','missing_capture');end if;
 if r.state in ('staged','sealed') then
   return public.pj_legacy_loyalty_stage_status(r.snapshot_id) || jsonb_build_object('status','already_staged');
 end if;
 if r.state<>'captured' then return jsonb_build_object('status','capture_incomplete');end if;
 if (select count(distinct stream) from public.pj_loyalty_capture_pages where run_id=p_run and next_cursor is null)<>3
 then return jsonb_build_object('status','capture_incomplete');end if;
 -- Validate every sequence and archived count, including the final cursor.
 if exists (
  select 1 from (
   select p.*,row_number() over(partition by stream order by page_number) as seq,
     lag(next_cursor) over(partition by stream order by page_number) as prior_cursor,
     lead(page_number) over(partition by stream order by page_number) as following_page
   from public.pj_loyalty_capture_pages p where run_id=p_run
  ) h where h.seq<>h.page_number or h.prior_cursor is distinct from h.requested_cursor
    or (h.next_cursor is null)<>(h.following_page is null)
    or h.record_count<>jsonb_array_length(h.response->case h.stream when 'accounts' then 'loyalty_accounts' when 'events' then 'events' else 'rewards' end)
 ) then return jsonb_build_object('status','capture_checkpoint_mismatch');end if;
 select count(*) into dup from (
 select p.stream,a->>'id' from public.pj_loyalty_capture_pages p
 cross join lateral jsonb_array_elements(p.response->case p.stream when 'accounts' then 'loyalty_accounts' when 'events' then 'events' else 'rewards' end) a
 where p.run_id=p_run group by p.stream,a->>'id' having count(*)>1
 ) d;
 if dup>0 then return jsonb_build_object('status','duplicate_square_records','count',dup);end if;
 select count(*),count(*) filter(where a->>'program_id' is distinct from r.source_program_id
    or nullif(btrim(a->>'customer_id'),'') is null or length(a->>'customer_id')>128
    or length(a->>'id')>128
    or jsonb_typeof(a->'balance') is distinct from 'number'
    or coalesce(a->>'balance','') !~ '^[0-9]{1,9}$'
    or jsonb_typeof(a->'lifetime_points') is distinct from 'number'
    or coalesce(a->>'lifetime_points','') !~ '^[0-9]{1,9}$')
 into n,bad from public.pj_loyalty_capture_pages p cross join lateral jsonb_array_elements(p.response->'loyalty_accounts') a
 where p.run_id=p_run and p.stream='accounts';
 if n=0 or bad>0 then return jsonb_build_object('status','unresolved_accounts','count',bad,'accounts',n);end if;
 select count(*) into dup from (
 select a->>'customer_id' from public.pj_loyalty_capture_pages p cross join lateral jsonb_array_elements(p.response->'loyalty_accounts') a
 where p.run_id=p_run and p.stream='accounts' group by a->>'customer_id' having count(*)>1
 ) d;
 if dup>0 then return jsonb_build_object('status','ambiguous_customer_identity','count',dup);end if;
 select sum((a->>'balance')::numeric),sum(least(275,(a->>'balance')::numeric))
 into total_points,capped_points
 from public.pj_loyalty_capture_pages p cross join lateral jsonb_array_elements(p.response->'loyalty_accounts') a
 where p.run_id=p_run and p.stream='accounts';
 select count(*) into issued from public.pj_loyalty_capture_pages p cross join lateral jsonb_array_elements(p.response->'rewards') a
 where p.run_id=p_run and p.stream='rewards' and a->>'status'='ISSUED';
 select jsonb_object_agg(c.stream,c.record_total) into counts from
  (select stream,sum(record_count) record_total from public.pj_loyalty_capture_pages where run_id=p_run group by stream) c;
 select encode(extensions.digest(string_agg(stream||'/'||page_number::text||':'||response_sha256,E'\n' order by stream,page_number),'sha256'),'hex')
 into archive_hash from public.pj_loyalty_capture_pages where run_id=p_run;
 s:=public.pj_legacy_loyalty_stage_begin(jsonb_build_object(
 'squareProgramId',r.source_program_id,'squareApiVersion',r.api_version,
 'captureStartedAt',r.started_at,'captureFinishedAt',r.completed_at,'archiveFingerprintSha256',archive_hash,
 'expectedAccounts',n,'accountsComplete',true,'eventsComplete',true,'rewardsComplete',true));
 for batch in
  select jsonb_agg(member order by seq) from (
   select row_number() over(order by a->>'id') seq,
   jsonb_build_object('squareLoyaltyAccountId',a->>'id','squareCustomerId',a->>'customer_id',
   'outstandingPoints',a->'balance','lifetimePoints',a->'lifetime_points','sourceUpdatedAt',a->>'updated_at',
   'rawAccountSha256',encode(extensions.digest(a::text,'sha256'),'hex')) member
   from public.pj_loyalty_capture_pages p cross join lateral jsonb_array_elements(p.response->'loyalty_accounts') a
   where p.run_id=p_run and p.stream='accounts'
  ) m group by ((seq-1)/100)
 loop
   result:=public.pj_legacy_loyalty_stage_batch(s,batch);
   if result->>'status' is distinct from 'staged' then raise exception 'PJ_CAPTURE_REGISTER_STAGE_FAILED';end if;
 end loop;
 result:=public.pj_legacy_loyalty_stage_status(s);
 if (result->>'stored')::integer<>n or (result->>'unresolved_members')::integer<>0
 then raise exception 'PJ_CAPTURE_REGISTER_RECONCILIATION_FAILED';end if;
 update public.pj_loyalty_capture_runs set state='staged',snapshot_id=s where id=p_run;
 return jsonb_build_object('status','staged','snapshot_id',s,'counts',counts,
 'outstanding_square_points',total_points,'capped_pj_credits',capped_points,
 'points_above_cap',total_points-capped_points,'issued_rewards_requiring_review',issued,
 'credits_transferred',0,'sealed',false);
end
$function$;
