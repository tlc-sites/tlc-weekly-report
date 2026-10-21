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
