-- 보고서 열람 직급은 작성 당시 직급을 보존한다. 개인정보 범위는 확대하지 않는다.
create function report.content_layer(p_user uuid) returns integer
language sql stable security definer set search_path='' as $$
  select coalesce((select case when p.recipient_role is not null then 4 when p.is_minister then 3
    when exists(select 1 from report.memberships m where m.user_id=p.id and m.role='reviewer') then 2
    when exists(select 1 from report.memberships m where m.user_id=p.id) then 1 else 0 end
    from report.profiles p where p.id=p_user and p.status='active'),0);
$$;
create function report.same_content_layer(layer integer) returns boolean
language sql stable security definer set search_path='' as $$
  select layer>0 and layer=report.content_layer(auth.uid());
$$;
alter table report.reports add column author_layer integer not null default 0;
alter table report.worship_incidents add column author_layer integer not null default 0;
alter table report.reports disable trigger reports_updated_at;
alter table report.reports disable trigger reports_identity;
update report.reports set author_layer=report.content_layer(author_id);
alter table report.reports enable trigger reports_updated_at;
alter table report.reports enable trigger reports_identity;
alter table report.worship_incidents disable trigger validate_worship_incident;
update report.worship_incidents set author_layer=report.content_layer(author_id);
alter table report.worship_incidents enable trigger validate_worship_incident;
create function report.stamp_content_layer() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if TG_OP='INSERT' then new.author_layer=report.content_layer(new.author_id);
  else new.author_layer=old.author_layer; end if;
  return new;
end;
$$;
create trigger reports_layer before insert or update on report.reports for each row execute function report.stamp_content_layer();
create trigger incidents_layer before insert or update on report.worship_incidents for each row execute function report.stamp_content_layer();
create function report.sync_report_identity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 new.details=jsonb_set(new.details,'{_report_meta}',case when jsonb_typeof(new.details->'_report_meta')='object' then new.details->'_report_meta' else '{}'::jsonb end||jsonb_build_object('author_name',new.author_name,'duty_part',new.duty_part,'last_editor_id',new.last_edited_by,'last_editor_name',(select real_name from report.profiles where id=new.last_edited_by)));
 return new;
end;
$$;
create trigger reports_sync_meta before insert or update on report.reports for each row execute function report.sync_report_identity();
drop policy reports_select on report.reports;
create policy reports_select on report.reports for select to authenticated using(report.is_active_user() and (
  report.is_senior() or report.same_content_layer(author_layer) or report.group_role(group_id)='reviewer' or report.assigned_clergy(group_id)
  or (author_id=auth.uid() and report.group_role(group_id) is not null) or report.has_report_share(id)));
create or replace function report.can_view_report(rid uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select report.is_active_user() and exists(select 1 from report.reports r where r.id=rid and (
    report.is_senior() or report.same_content_layer(r.author_layer) or report.group_role(r.group_id)='reviewer' or report.assigned_clergy(r.group_id)
    or (r.author_id=auth.uid() and report.group_role(r.group_id) is not null) or report.has_report_share(rid)));
$$;
-- 같은 직급 일반 보고를 보더라도 명단·연락처·비공개 글은 열리지 않는다.
create or replace function report.can_view_group(gid uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select report.is_senior() or report.group_role(gid) is not null or exists(select 1 from report.reports r where r.group_id=gid and (report.same_content_layer(r.author_layer) or report.has_report_share(r.id)));
$$;
drop policy incidents_read on report.worship_incidents;
create policy incidents_read on report.worship_incidents for select to authenticated using(report.same_content_layer(author_layer) or report.can_read_incident(author_id,group_ids) or report.can_view_incident(id));
do $$ declare body text; begin
 body=pg_get_functiondef('report.can_view_incident(uuid)'::regprocedure);
 body=replace(body,'report.is_senior() or exists','report.is_senior() or report.same_content_layer(i.author_layer) or exists');
 execute body;
end $$;
create function report.can_view_roster(gid uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select report.is_senior() or report.group_role(gid) is not null;
$$;

-- 기존 여러 팀 이슈는 보존하고 신규 작성만 자기 팀 하나로 제한한다.
create function report.validate_incident_team() returns trigger
language plpgsql set search_path='' as $$
begin
 if cardinality(new.group_ids)<>1 then raise exception 'one source team required'; end if;
 if new.report_id is not null and not exists(select 1 from report.reports r where r.id=new.report_id and r.group_id=new.group_ids[1]) then raise exception 'source report team mismatch'; end if;
 if not report.can_write_group(new.group_ids[1]) then raise exception 'forbidden' using errcode='42501'; end if;
 return new;
end;
$$;
create trigger incidents_source_team before insert on report.worship_incidents for each row execute function report.validate_incident_team();

-- 팀 회의/공과는 학생 출결과 재적 통계에 포함하지 않는다.
do $$ declare body text; begin
 body=pg_get_functiondef('report.save_report(uuid,jsonb,report.report_status)'::regprocedure);
 if position('if v_type = ''education'' then' in body)=0 then raise exception 'education branch missing'; end if;
 body=replace(body,'if v_type = ''education'' then','if v_type = ''education'' and coalesce(p_payload->''details''->>''session_type'',''standard'') not in (''meeting'',''curriculum'') then');
 body=regexp_replace(body,'  update report.reports',
  '  if coalesce((select details->>''session_type'' from report.reports where id=p_report),''standard'') <> coalesce(p_payload->''details''->>''session_type'',''standard'') then raise exception ''report kind cannot change''; end if;
  update report.reports');
 execute body;
end $$;

insert into report.groups(type,name,schedule,settings,sort_order)
select 'other','스데반 인턴십','weekly','{"report_category":"internship"}',35
where not exists(select 1 from report.groups where name='스데반 인턴십');
insert into report.group_service_types(group_id,service_type_id)
select g.id,s.id from report.groups g cross join report.service_types s where g.settings->>'report_category'='internship' and s.is_active on conflict do nothing;
-- 수요예배는 주일과 별개 선택지로 유지한다.
insert into report.group_service_types(group_id,service_type_id)
select g.id,s.id from report.groups g cross join report.service_types s where g.is_active and g.type in ('education','worship','other') and s.name='수요예배' and s.is_active on conflict do nothing;

create table report.rehearsals (
 id uuid primary key default gen_random_uuid(),group_id uuid not null references report.groups(id),
 held_on date not null,title text not null check(char_length(btrim(title)) between 1 and 100),
 author_id uuid not null default auth.uid() references report.profiles(id),created_at timestamptz not null default now(),
 unique(group_id,held_on,title)
);
create table report.rehearsal_attendance (
 rehearsal_id uuid not null references report.rehearsals(id) on delete cascade,
 member_id uuid not null references report.members(id),status text not null check(status in ('attended','absent','excused')),
 note text not null default '' check(char_length(note)<=200),primary key(rehearsal_id,member_id)
);
alter table report.rehearsals enable row level security;
alter table report.rehearsal_attendance enable row level security;
revoke all on report.rehearsals,report.rehearsal_attendance from public,anon,authenticated;
grant select,insert,update on report.rehearsals,report.rehearsal_attendance to authenticated;
create function report.can_manage_rehearsal(gid uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select report.is_senior() or report.group_role(gid)='reviewer' or report.assigned_clergy(gid);
$$;
create policy members_team_insert on report.members for insert to authenticated with check(kind='teacher' and report.can_manage_rehearsal(group_id) and exists(select 1 from report.groups where id=group_id and type='worship'));
create policy members_team_update on report.members for update to authenticated using(kind='teacher' and report.can_manage_rehearsal(group_id) and exists(select 1 from report.groups where id=group_id and type='worship')) with check(kind='teacher' and report.can_manage_rehearsal(group_id) and exists(select 1 from report.groups where id=group_id and type='worship'));
create policy rehearsals_read on report.rehearsals for select to authenticated using(report.can_view_roster(group_id));
create policy rehearsals_insert on report.rehearsals for insert to authenticated with check(author_id=auth.uid() and report.can_manage_rehearsal(group_id));
create policy rehearsals_update on report.rehearsals for update to authenticated using(report.can_manage_rehearsal(group_id)) with check(report.can_manage_rehearsal(group_id));
create policy rehearsal_attendance_read on report.rehearsal_attendance for select to authenticated using(exists(select 1 from report.rehearsals r where r.id=rehearsal_id and report.can_view_roster(r.group_id)));
create policy rehearsal_attendance_insert on report.rehearsal_attendance for insert to authenticated with check(exists(select 1 from report.rehearsals r where r.id=rehearsal_id and report.can_manage_rehearsal(r.group_id)));
create policy rehearsal_attendance_update on report.rehearsal_attendance for update to authenticated using(exists(select 1 from report.rehearsals r where r.id=rehearsal_id and report.can_manage_rehearsal(r.group_id))) with check(exists(select 1 from report.rehearsals r where r.id=rehearsal_id and report.can_manage_rehearsal(r.group_id)));
create function report.validate_rehearsal() returns trigger
language plpgsql set search_path='' as $$
begin
 if TG_TABLE_NAME='rehearsals' then
  if new.held_on>(now() at time zone 'Asia/Seoul')::date then raise exception 'future rehearsal'; end if;
  if TG_OP='UPDATE' and (new.group_id,new.held_on,new.author_id) is distinct from (old.group_id,old.held_on,old.author_id) then raise exception 'immutable rehearsal source'; end if;
  if not exists(select 1 from report.groups where id=new.group_id and type='worship' and is_active) then raise exception 'worship team required'; end if;
 else
  if not exists(select 1 from report.rehearsals r join report.members m on m.group_id=r.group_id where r.id=new.rehearsal_id and m.id=new.member_id and m.status<>'inactive') then raise exception 'member team mismatch'; end if;
 end if;
 return new;
end;
$$;
create trigger validate_rehearsal before insert or update on report.rehearsals for each row execute function report.validate_rehearsal();
create trigger validate_rehearsal_attendance before insert or update on report.rehearsal_attendance for each row execute function report.validate_rehearsal();
create function report.save_rehearsal(p_group uuid,p_date date,p_title text,p_rows jsonb) returns uuid
language plpgsql set search_path='' as $$
declare rid uuid; item jsonb;
begin
 if not coalesce(report.can_manage_rehearsal(p_group),false) then raise exception 'forbidden' using errcode='42501'; end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>300 then raise exception 'invalid attendance rows'; end if;
 if (select count(*) from jsonb_array_elements(p_rows))<>(select count(distinct x->>'member_id') from jsonb_array_elements(p_rows) x) then raise exception 'duplicate participant'; end if;
 insert into report.rehearsals(group_id,held_on,title) values(p_group,p_date,btrim(p_title)) on conflict(group_id,held_on,title) do update set title=excluded.title returning id into rid;
 for item in select * from jsonb_array_elements(p_rows) loop
  insert into report.rehearsal_attendance(rehearsal_id,member_id,status,note) values(rid,(item->>'member_id')::uuid,item->>'status',coalesce(item->>'note',''))
   on conflict(rehearsal_id,member_id) do update set status=excluded.status,note=excluded.note;
 end loop;
 return rid;
end;
$$;

create table report.registration_alerts(applicant_id uuid primary key references report.profiles(id),created_at timestamptz not null default now(),delivered_at timestamptz,claimed_until timestamptz,attempts integer not null default 0);
alter table report.registration_alerts enable row level security;
revoke all on report.registration_alerts from public,anon,authenticated;
grant select on report.registration_alerts to authenticated;
create policy registration_alerts_admin on report.registration_alerts for select to authenticated using(report.is_admin());
create function report.enqueue_registration_alert() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status='pending' and cardinality(new.requested_group_ids)>0 then
  insert into report.registration_alerts(applicant_id) values(new.id) on conflict do nothing;
 end if;
 return new;
end;
$$;
create trigger report_registration_alert after insert or update of requested_group_ids,status on report.profiles for each row execute function report.enqueue_registration_alert();
create function report.claim_registration_alert(p_user uuid) returns boolean
language sql set search_path='' as $$
 with claimed as (update report.registration_alerts set claimed_until=now()+interval '5 minutes',attempts=attempts+1 where applicant_id=p_user and delivered_at is null and (claimed_until is null or claimed_until<now()) returning 1)
 select exists(select 1 from claimed);
$$;
revoke all on function report.content_layer(uuid),report.same_content_layer(integer),report.can_view_roster(uuid),report.can_manage_rehearsal(uuid),report.stamp_content_layer(),report.validate_incident_team(),report.validate_rehearsal(),report.enqueue_registration_alert() from public,anon;
revoke all on function report.sync_report_identity() from public,anon;
grant execute on function report.content_layer(uuid),report.same_content_layer(integer),report.can_view_roster(uuid),report.can_manage_rehearsal(uuid) to authenticated;
revoke all on function report.save_rehearsal(uuid,date,text,jsonb) from public,anon;
grant execute on function report.save_rehearsal(uuid,date,text,jsonb) to authenticated;
revoke all on function report.claim_registration_alert(uuid) from public,anon,authenticated;
grant execute on function report.claim_registration_alert(uuid) to service_role;
