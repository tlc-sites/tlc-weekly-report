-- 기존 보고/그룹 ID를 유지하며 새 팀·명단·모임 마감을 추가한다.
insert into report.groups(type,name,parent_id,schedule,sort_order)
select 'worship',v.name,p.id,'irregular',v.ord from (values('안내팀',96),('송번역팀',97))v(name,ord)
cross join report.groups p where p.name='예배/기술팀' and p.parent_id is null
and not exists(select 1 from report.groups g where g.name=v.name);
insert into report.group_service_types(group_id,service_type_id)
select g.id,s.id from report.groups g cross join report.service_types s
where g.name in ('안내팀','송번역팀') and s.is_active on conflict do nothing;
alter table report.prayer_meeting_reports add column prayer_leader text not null default '' check(char_length(prayer_leader)<=100);
alter table report.prayer_meeting_reports add column attendee_names text not null default '' check(char_length(attendee_names)<=3000);
create table report.team_directory(
 id uuid primary key default gen_random_uuid(),group_id uuid not null references report.groups(id),
 name text not null check(char_length(btrim(name)) between 1 and 100),duty text not null default '' check(char_length(duty)<=200),
 is_active boolean not null default true,created_by uuid not null references report.profiles(id),created_at timestamptz not null default now());
alter table report.team_directory enable row level security;
revoke all on report.team_directory from public,anon,authenticated;
grant select,insert on report.team_directory to authenticated;
grant update(name,duty,is_active) on report.team_directory to authenticated;
create policy directory_read on report.team_directory for select to authenticated using(report.is_active_user() and (report.is_senior() or report.group_role(group_id) is not null or report.assigned_clergy(group_id)));
create policy directory_add on report.team_directory for insert to authenticated with check(created_by=auth.uid() and (report.is_senior() or report.assigned_clergy(group_id)));
create policy directory_change on report.team_directory for update to authenticated using(report.is_senior() or report.assigned_clergy(group_id)) with check(report.is_senior() or report.assigned_clergy(group_id));
create table report.meeting_deadline_schedules(
 id uuid primary key default gen_random_uuid(),group_id uuid not null references report.groups(id),
 service_type_id uuid references report.service_types(id),label text not null check(char_length(btrim(label)) between 1 and 100),
 weekday integer not null check(weekday between 0 and 6),end_time time not null,
 is_active boolean not null default true,enabled_at timestamptz not null default now());
create unique index meeting_schedule_key on report.meeting_deadline_schedules(group_id,coalesce(service_type_id,'00000000-0000-0000-0000-000000000000'::uuid),label);
alter table report.meeting_deadline_schedules enable row level security;
revoke all on report.meeting_deadline_schedules from public,anon,authenticated;
grant select,insert,update on report.meeting_deadline_schedules to authenticated;
grant all on report.meeting_deadline_schedules to service_role;
create policy schedule_read on report.meeting_deadline_schedules for select to authenticated using(report.is_active_user() and (report.is_senior() or report.group_role(group_id) is not null));
create policy schedule_add on report.meeting_deadline_schedules for insert to authenticated with check(report.is_senior() or report.assigned_clergy(group_id));
create policy schedule_update on report.meeting_deadline_schedules for update to authenticated using(report.is_senior() or report.assigned_clergy(group_id)) with check(report.is_senior() or report.assigned_clergy(group_id));
create function report.restart_meeting_schedule() returns trigger language plpgsql set search_path='' as $$
begin
 if new.end_time<>old.end_time or new.weekday<>old.weekday or new.label<>old.label or (new.is_active and not old.is_active) then new.enabled_at=now(); end if;
 return new;
end $$;
revoke all on function report.restart_meeting_schedule() from public,anon,authenticated;
create trigger restart_schedule before update on report.meeting_deadline_schedules for each row execute function report.restart_meeting_schedule();
insert into report.meeting_deadline_schedules(group_id,service_type_id,label,weekday,end_time)
select g.id,s.id,s.name,s.weekday,case
 when s.name='1부 예배' then '10:20'::time when s.name='2부 예배' then '12:40'::time
 when s.name='3부 예배' then '15:00'::time when s.name='라이프라인' then '22:00'::time
 when s.name='수요예배' then '12:00'::time else '23:00'::time end
from report.groups g join report.group_service_types gs on gs.group_id=g.id join report.service_types s on s.id=gs.service_type_id
where g.type='worship' and g.is_active and s.is_active and s.weekday in(0,3,5);
create table report.meeting_reminder_claims(
 schedule_id uuid not null references report.meeting_deadline_schedules(id),meeting_date date not null,
 user_id uuid not null references report.profiles(id),bucket integer not null,created_at timestamptz not null default now(),
 primary key(schedule_id,meeting_date,user_id,bucket));
alter table report.meeting_reminder_claims enable row level security;
revoke all on report.meeting_reminder_claims from public,anon,authenticated;
grant all on report.meeting_reminder_claims to service_role;
create function report.claim_meeting_reminders(p_now timestamptz default now()) returns table(user_id uuid,group_id uuid,label text,meeting_date date) language sql security definer set search_path='' as $$
 with recursive ancestors as (
 select g.id as child,g.id as ancestor from report.groups g where g.is_active
 union all select a.child,g.parent_id from ancestors a join report.groups g on g.id=a.ancestor where g.parent_id is not null
 ), occurrences as (
 select s.*,d::date as day,
 ((d::date+s.end_time) at time zone 'Asia/Seoul')+interval '3 hours' as due
 from report.meeting_deadline_schedules s join report.groups g on g.id=s.group_id and g.is_active
 cross join lateral generate_series((s.enabled_at at time zone 'Asia/Seoul')::date,(p_now at time zone 'Asia/Seoul')::date,interval '1 day') d
 left join report.service_types st on st.id=s.service_type_id
 where s.is_active and extract(dow from d)=s.weekday and (s.service_type_id is null or st.is_active)
 and (st.month_week is null or st.month_week=ceil(extract(day from d)/7) or st.month_week=-1 and extract(month from d+interval '7 days')<>extract(month from d))
 and ((d::date+s.end_time) at time zone 'Asia/Seoul')>=s.enabled_at
 ), missing as (
 select distinct o.id,o.group_id,o.label,o.day,o.due,m.user_id as missing_user
 from occurrences o join ancestors a on a.child=o.group_id join report.memberships m on m.group_id=a.ancestor
 join report.profiles p on p.id=m.user_id and p.status='active'
 where p_now>=o.due and (m.role='writer' or m.position in('교역자','담당교역자') or m.position is null and p.is_minister)
 and not exists(select 1 from report.week_status w where w.group_id=o.group_id and w.week=o.day-extract(dow from o.day)::int and w.no_meeting)
 and not exists(select 1 from report.reports r where r.group_id=o.group_id and r.author_id=m.user_id and r.meeting_date=o.day and r.status in('submitted','reviewed')
 and ((o.id is not null and r.service_type_id=(select s.service_type_id from report.meeting_deadline_schedules s where s.id=o.id))
 or (r.service_type_id is null and (r.meeting_label=o.label or exists(select 1 from report.group_meeting_types mt where mt.id=r.group_meeting_type_id and mt.name=o.label)))))
 ), targets as (
 select distinct m.id,m.group_id,m.label,m.day,m.due,p.id as recipient
 from missing m join report.profiles p on p.status='active' and p.notify_enabled and (p.id=m.missing_user or p.recipient_role is not null)
 ), claimed as (
 insert into report.meeting_reminder_claims(schedule_id,meeting_date,user_id,bucket)
 select t.id,t.day,t.recipient,floor(extract(epoch from p_now-t.due)/7200)::int from targets t
 on conflict do nothing returning *
 )
 select c.user_id,t.group_id,t.label,t.day from claimed c join targets t on t.id=c.schedule_id and t.day=c.meeting_date and t.recipient=c.user_id;
$$;
revoke all on function report.claim_meeting_reminders(timestamptz) from public,anon,authenticated;
grant execute on function report.claim_meeting_reminders(timestamptz) to service_role;
