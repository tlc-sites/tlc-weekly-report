-- 기능 관리자가 자기 보고를 작성하는 권한은 타인 내용·명단 열람과 분리한다.
create function report.can_create_report(gid uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select report.is_active_user() and exists(select 1 from report.groups g where g.id=gid and g.is_active
    and not exists(select 1 from report.groups c where c.parent_id=g.id and c.is_active)
    and (report.is_admin() or report.can_write_group(gid)));
$$;
revoke all on function report.can_create_report(uuid) from public,anon;
grant execute on function report.can_create_report(uuid) to authenticated;
create policy reports_admin_author_read on report.reports for select to authenticated
  using(report.is_admin() and author_id=auth.uid());
create policy reports_admin_author_insert on report.reports for insert to authenticated
  with check(report.is_admin() and author_id=auth.uid() and status='draft' and report.can_create_report(group_id));
create policy reports_admin_author_update on report.reports for update to authenticated
  using(report.is_admin() and author_id=auth.uid() and status<>'reviewed')
  with check(report.is_admin() and author_id=auth.uid() and status in ('draft','submitted'));
create or replace function report.can_edit_report(rid uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select report.is_active_user() and exists(select 1 from report.reports r where r.id=rid and (
    report.can_review_group(r.group_id) or (r.author_id=auth.uid() and r.status<>'reviewed'
      and (report.can_write_group(r.group_id) or report.is_admin()))));
$$;
do $$ declare body text; begin
  body=pg_get_functiondef('report.can_view_report(uuid)'::regprocedure);
  if position('report.has_setup_access()' in body)=0 then raise exception 'setup access helper missing'; end if;
  execute replace(body,'report.has_setup_access()','(report.has_setup_access() or (report.is_admin() and r.author_id=auth.uid()))');
  body=pg_get_functiondef('report.can_view_group(uuid)'::regprocedure);
  execute replace(body,'report.has_setup_access()','(report.has_setup_access() or report.is_admin())');
end $$;
-- 명단을 읽을 수 없는데 빈 출결을 제출해 통계를 잘못 만드는 것을 막는다.
create function report.validate_admin_attendance_report() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='submitted' and report.is_admin() and not report.can_view_roster(new.group_id)
    and coalesce(new.details->>'session_type','standard') not in ('meeting','curriculum')
    and exists(select 1 from report.groups g where g.id=new.group_id and g.type='education')
    and exists(select 1 from report.members m where m.group_id=new.group_id and m.kind='student' and m.status in ('active','newcomer')) then
    raise exception 'education attendance assignment required' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function report.validate_admin_attendance_report() from public,anon;
create trigger reports_admin_attendance before insert or update on report.reports for each row execute function report.validate_admin_attendance_report();
