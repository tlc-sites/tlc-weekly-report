-- 관리자가 그룹 관리에서 예배/기술팀 명단(팀원)을 보고 추가·수정할 수 있게 한다.
-- 관리자에게 열리는 것은 예배/기술팀의 팀원(kind='teacher')뿐이다. 학생·보호자 정보와 교회학교 명단은 바꾸지 않는다. 삭제 권한(members_delete)도 그대로다.
create or replace function report.is_worship_group(gid uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from report.groups where id=gid and type='worship');
$$;
revoke all on function report.is_worship_group(uuid) from public,anon;
grant execute on function report.is_worship_group(uuid) to authenticated;

create or replace function report.can_view_roster(gid uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select report.is_senior() or report.group_role(gid) is not null or (report.is_admin() and report.is_worship_group(gid));
$$;

alter policy members_select on report.members
  using (report.is_senior() or report.group_role(group_id) is not null or (kind='teacher' and report.is_admin() and report.is_worship_group(group_id)));
alter policy members_team_insert on report.members
  with check (kind='teacher' and report.is_worship_group(group_id) and (report.can_manage_rehearsal(group_id) or report.is_admin()));
alter policy members_team_update on report.members
  using (kind='teacher' and report.is_worship_group(group_id) and (report.can_manage_rehearsal(group_id) or report.is_admin()))
  with check (kind='teacher' and report.is_worship_group(group_id) and (report.can_manage_rehearsal(group_id) or report.is_admin()));
