-- Execute the entire single DO statement, without selecting a subsection.
DO $deployment$
BEGIN
 EXECUTE $deployment_batch$
-- DB22 + DB23. Run the whole file once in the report project's SQL Editor.
-- No account role assignment or email sending is included.
set local lock_timeout='10s';
do $$ begin
 if to_regclass('report.internship_participants') is not null or exists(select 1 from information_schema.columns where table_schema='report' and table_name='prayer_meeting_reports' and column_name='prayer_session') then
 raise exception 'DB22 or DB23 already present: stop and inspect migration state'; end if;
end $$;
create temp table pg_temp.report_deploy_original_rows(table_name text, original_row jsonb) on commit drop;
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='report' loop
 execute format('lock table report.%I in share row exclusive mode',t.tablename);
 execute format('insert into pg_temp.report_deploy_original_rows select %L,to_jsonb(r) from report.%I r',t.tablename,t.tablename);
 end loop;
end $$;
-- 관리자에게 타인 교역자 지정만 위임하며 자기/최상단 승격은 계속 차단한다.
create or replace function report.protect_content_roles() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and not report.is_senior() then
  if TG_TABLE_NAME='profiles' then
   if new.recipient_role is distinct from old.recipient_role then raise exception 'senior permission required' using errcode='42501'; end if;
   if new.is_minister is distinct from old.is_minister and not (report.is_admin() and new.id<>auth.uid() and old.recipient_role is null) then raise exception 'minister assignment permission required' using errcode='42501'; end if;
  elsif (case when TG_OP='DELETE' then old.user_id else new.user_id end)=auth.uid() then raise exception 'cannot change own content assignments' using errcode='42501';
  end if;
 end if;
 if TG_OP='DELETE' then return old; end if; return new;
end $$;
create or replace function report.set_minister(p_user uuid,p_enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not report.is_admin() or (p_user=auth.uid() and not report.is_senior()) then raise exception 'forbidden' using errcode='42501'; end if;
 update report.profiles set is_minister=p_enabled where id=p_user and status='active' and (report.is_senior() or recipient_role is null);
 if not found then raise exception 'active non-senior user required'; end if;
end $$;
create function report.approve_minister_user(p_user uuid,p_assignments jsonb,p_make_admin boolean default false) returns void language plpgsql security definer set search_path='' as $$
begin
 if not report.is_admin() or p_user=auth.uid() then raise exception 'forbidden' using errcode='42501'; end if;
 update report.profiles set is_minister=true where id=p_user and status='pending' and recipient_role is null;
 if not found then raise exception 'pending user required'; end if;
 perform report.approve_user(p_user,p_assignments,p_make_admin);
end $$;
revoke all on function report.approve_minister_user(uuid,jsonb,boolean) from public,anon;
grant execute on function report.approve_minister_user(uuid,jsonb,boolean) to authenticated;
drop policy reports_delete on report.reports;
create policy reports_delete on report.reports for delete to authenticated using(report.is_active_user() and (report.is_senior() or author_id=auth.uid() and status='draft'));
alter table report.worship_incidents drop constraint worship_incidents_report_id_fkey;
alter table report.worship_incidents add constraint worship_incidents_report_id_fkey foreign key(report_id) references report.reports(id) on delete set null;
-- 참조 초안 삭제 때만 경위서 연결을 해제하며, 원문과 작성 정보는 보존한다.
do $$ declare body text; begin
 body=pg_get_functiondef('report.validate_worship_incident()'::regprocedure);
 if position('new.id,new.author_id,new.report_id,new.group_ids' in body)=0 then raise exception 'incident identity validator mismatch'; end if;
 body=replace(body,'new.id,new.author_id,new.report_id,new.group_ids','new.id,new.author_id,new.group_ids');
 body=replace(body,'old.id,old.author_id,old.report_id,old.group_ids','old.id,old.author_id,old.group_ids');
 body=replace(body,'if TG_OP=''UPDATE'' then','if TG_OP=''UPDATE'' then
    if new.report_id is distinct from old.report_id and not (new.report_id is null and old.report_id is not null and pg_trigger_depth()>1) then raise exception ''report link is immutable''; end if;');
 execute body;
end $$;
-- 기존 스데반 원본 그룹·보고·소속을 유지한다. 상위 담당은 세 반에 상속된다.
insert into report.groups(type,name,parent_id,schedule,settings,sort_order)
select 'other',v.name,p.id,'weekly','{"report_category":"internship","internship_class":true}'::jsonb,v.ord
from (values('A반',1),('B반',2),('목요반',3)) v(name,ord)
cross join report.groups p where p.name='스데반 인턴십' and p.parent_id is null
and not exists(select 1 from report.groups g where g.parent_id=p.id and g.name=v.name);
insert into report.group_service_types(group_id,service_type_id)
select g.id,s.id from report.groups g cross join report.service_types s where g.settings->>'internship_class'='true' and s.is_active on conflict do nothing;
create function report.can_manage_internship(gid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select report.is_active_user() and exists(select 1 from report.groups g where g.id=gid and g.is_active and g.settings->>'internship_class'='true') and (report.is_senior() or report.group_role(gid) is not null);
$$;
revoke all on function report.can_manage_internship(uuid) from public,anon;
grant execute on function report.can_manage_internship(uuid) to authenticated;
create table report.internship_participants(
 id uuid primary key default gen_random_uuid(),group_id uuid not null references report.groups(id),
 name text not null check(char_length(btrim(name)) between 1 and 100),is_active boolean not null default true,
 created_by uuid not null references report.profiles(id),created_at timestamptz not null default now());
alter table report.internship_participants enable row level security;
revoke all on report.internship_participants from public,anon,authenticated;
grant select,insert on report.internship_participants to authenticated;
grant update(name,is_active) on report.internship_participants to authenticated;
create policy participant_read on report.internship_participants for select to authenticated using(report.can_manage_internship(group_id));
create policy participant_add on report.internship_participants for insert to authenticated with check(report.can_manage_internship(group_id) and created_by=auth.uid());
create policy participant_change on report.internship_participants for update to authenticated using(report.can_manage_internship(group_id)) with check(report.can_manage_internship(group_id));
create table report.internship_attendance(
 group_id uuid not null references report.groups(id),held_on date not null,participant_id uuid not null references report.internship_participants(id),
 participant_name text not null,mark text not null check(mark in('present','late','absent','excused')),note text not null default '' check(char_length(note)<=500),
 recorded_by uuid not null references report.profiles(id),updated_at timestamptz not null default now(),
 primary key(group_id,held_on,participant_id));
alter table report.internship_attendance enable row level security;
revoke all on report.internship_attendance from public,anon,authenticated;
grant select on report.internship_attendance to authenticated;
create policy attendance_read on report.internship_attendance for select to authenticated using(report.can_manage_internship(group_id));
create function report.save_internship_attendance(p_group uuid,p_date date,p_rows jsonb) returns void language plpgsql security definer set search_path='' as $$
declare rowdata jsonb; participant record; begin
 if not report.can_manage_internship(p_group) then raise exception 'forbidden' using errcode='42501'; end if;
 if p_date is null or p_date>(now() at time zone 'Asia/Seoul')::date then raise exception 'invalid attendance date'; end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)=0 then raise exception 'attendance rows required'; end if;
 perform 1 from report.groups where id=p_group for update;
 if (select count(*) from report.internship_participants where group_id=p_group and is_active)<>jsonb_array_length(p_rows)
 or (select count(distinct x->>'participant_id') from jsonb_array_elements(p_rows)x)<>jsonb_array_length(p_rows) then raise exception 'roster changed or duplicate participant'; end if;
 for rowdata in select * from jsonb_array_elements(p_rows) loop
  select id,name into participant from report.internship_participants where id=(rowdata->>'participant_id')::uuid and group_id=p_group and is_active;
  if not found then raise exception 'invalid participant'; end if;
  insert into report.internship_attendance(group_id,held_on,participant_id,participant_name,mark,note,recorded_by)
  values(p_group,p_date,participant.id,participant.name,rowdata->>'mark',coalesce(rowdata->>'note',''),auth.uid())
  on conflict(group_id,held_on,participant_id) do update set mark=excluded.mark,note=excluded.note,recorded_by=excluded.recorded_by,updated_at=now();
 end loop;
end $$;
revoke all on function report.save_internship_attendance(uuid,date,jsonb) from public,anon;
grant execute on function report.save_internship_attendance(uuid,date,jsonb) to authenticated;

alter table report.prayer_meeting_reports add column prayer_session text check(prayer_session in('morning','evening'));
create function report.validate_prayer_session() returns trigger language plpgsql set search_path='' as $$
begin
 if new.prayer_session is null then raise exception 'prayer session required'; end if;
 if (new.prayer_session='morning' and extract(dow from new.meeting_date) not in(1,2,4,5)) or (new.prayer_session='evening' and extract(dow from new.meeting_date) not in(1,2,3,4)) then raise exception 'prayer day mismatch'; end if;
 if length(btrim(new.attendee_names))=0 or length(btrim(new.prayer_topics))=0 then raise exception 'attendees and prayer topics required'; end if;
 return new; end $$;
create trigger prayer_session before insert on report.prayer_meeting_reports for each row execute function report.validate_prayer_session();
revoke all on function report.validate_prayer_session() from public,anon,authenticated;
create table report.prayer_meeting_comments(
 id uuid primary key default gen_random_uuid(),prayer_report_id uuid not null references report.prayer_meeting_reports(id) on delete cascade,
 author_id uuid not null references report.profiles(id),body text not null check(char_length(btrim(body)) between 1 and 1000),created_at timestamptz not null default now());
alter table report.prayer_meeting_comments enable row level security;
revoke all on report.prayer_meeting_comments from public,anon,authenticated;
grant select,insert,delete on report.prayer_meeting_comments to authenticated;
create policy prayer_comment_read on report.prayer_meeting_comments for select to authenticated using(report.is_clergy());
create policy prayer_comment_add on report.prayer_meeting_comments for insert to authenticated with check(report.is_clergy() and author_id=auth.uid());
create policy prayer_comment_delete on report.prayer_meeting_comments for delete to authenticated using(report.is_clergy() and (author_id=auth.uid() or report.is_senior()));
alter table report.inbox_notifications add column prayer_report_id uuid references report.prayer_meeting_reports(id) on delete cascade;
drop policy inbox_read on report.inbox_notifications;
create policy inbox_read on report.inbox_notifications for select to authenticated using(user_id=auth.uid() and report.is_active_user()
 and (url not like '/admin/%' or report.is_admin())
 and (notice_id is null or exists(select 1 from report.notices n where n.id=notice_id))
 and (report_id is null or report.can_view_report(report_id))
 and (incident_id is null or exists(select 1 from report.worship_incidents i where i.id=incident_id))
 and (minister_thread_id is null or report.can_read_minister_thread(minister_thread_id))
 and (prayer_report_id is null or report.is_clergy()));
create function report.notify_prayer_comment() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into report.inbox_notifications(user_id,title,body,url,prayer_report_id)
 select p.author_id,'기도제목에 코멘트가 등록되었습니다',left(new.body,160),'/prayer-meetings#prayer-'||p.id,p.id
 from report.prayer_meeting_reports p where p.id=new.prayer_report_id and p.author_id<>new.author_id;
 return new; end $$;
revoke all on function report.notify_prayer_comment() from public,anon,authenticated;
create trigger prayer_comment_inbox after insert on report.prayer_meeting_comments for each row execute function report.notify_prayer_comment();
create table report.weekly_email_deliveries(
 week date not null,recipient_id uuid not null references report.profiles(id),status text not null check(status in('sending','sent','failed')),
 claimed_at timestamptz not null default now(),sent_at timestamptz,primary key(week,recipient_id));
alter table report.weekly_email_deliveries enable row level security;
revoke all on report.weekly_email_deliveries from public,anon,authenticated;
grant all on report.weekly_email_deliveries to service_role;
create function report.claim_weekly_email(p_week date,p_recipient uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare claimed uuid; begin
 if extract(dow from p_week)<>0 or p_week>(now() at time zone 'Asia/Seoul')::date then raise exception 'invalid week'; end if;
 if not exists(select 1 from report.profiles where id=p_recipient and status='active' and recipient_role is not null and email is not null) then return false; end if;
 insert into report.weekly_email_deliveries(week,recipient_id,status) values(p_week,p_recipient,'sending')
 on conflict(week,recipient_id) do update set status='sending',claimed_at=now() where weekly_email_deliveries.status='failed' or (weekly_email_deliveries.status='sending' and weekly_email_deliveries.claimed_at<now()-interval '30 minutes')
 returning recipient_id into claimed;
 return claimed is not null;
end $$;
revoke all on function report.claim_weekly_email(date,uuid) from public,anon,authenticated;
grant execute on function report.claim_weekly_email(date,uuid) to service_role;

do $$ declare t record; missing boolean; begin
 for t in select distinct table_name from pg_temp.report_deploy_original_rows loop
 execute format('select exists(select 1 from pg_temp.report_deploy_original_rows o where o.table_name=%L and not exists(select 1 from report.%I r where to_jsonb(r) @> o.original_row))',t.table_name,t.table_name) into missing;
 if missing then raise exception 'Original data preservation check failed: %',t.table_name;end if;
 end loop;
 if exists(select 1 from pg_tables where schemaname='report' and tablename in('internship_participants','internship_attendance','prayer_meeting_comments','weekly_email_deliveries') and not rowsecurity) then raise exception 'New table RLS missing';end if;
end $$;


$deployment_batch$;
 RAISE NOTICE 'DB22 + DB23 applied; original rows preserved';
END
$deployment$;
select 'DB22 + DB23 applied; original rows preserved' as result;
