-- 일반 보고의 기본 공유만 확대한다. 비공개·명단·수정 권한은 변경하지 않는다.
create policy reports_clergy_default_read on report.reports for select to authenticated
 using(report.is_clergy() and status in ('submitted','reviewed'));
create or replace function report.can_view_report(rid uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select report.is_active_user() and exists(select 1 from report.reports r where r.id=rid and (
  report.is_senior() or report.has_setup_access() or (report.is_admin() and r.author_id=auth.uid())
  or (report.is_clergy() and r.status in ('submitted','reviewed'))
  or report.same_content_layer(r.author_layer) or report.group_role(r.group_id)='reviewer'
  or report.assigned_clergy(r.group_id) or (r.author_id=auth.uid() and report.group_role(r.group_id) is not null)
  or report.has_report_share(rid)));
$$;
-- 다른 파트 보고를 열 때 그룹 이름도 조회할 수 있게 한다. 명단 권한과 분리한다.
create policy groups_clergy_report_read on report.groups for select to authenticated
 using(report.is_clergy() and exists(select 1 from report.reports r where r.group_id=report.groups.id and r.status in ('submitted','reviewed')));
create or replace function report.can_view_group(gid uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select report.is_active_user() and (report.is_senior() or report.has_setup_access() or report.is_admin()
  or report.group_role(gid) is not null or exists(select 1 from report.reports r where r.group_id=gid and (
   report.same_content_layer(r.author_layer) or report.has_report_share(r.id)
   or (report.is_clergy() and r.status in ('submitted','reviewed')))));
$$;
