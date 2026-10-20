-- 작성 가능 여부와 검토 직책은 별개다. 교역자도 배정되지 않은 파트는 공개받아야 읽는다.
create function report.assigned_clergy(gid uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select report.is_clergy() and report.group_role(gid) is not null;
$$;
create function report.can_share_report(rid uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select report.is_senior() or exists(select 1 from report.reports r where r.id=rid and report.assigned_clergy(r.group_id));
$$;
alter table report.private_shares drop constraint private_shares_content_kind_check;
alter table report.private_shares add constraint private_shares_content_kind_check check(content_kind in ('report','prayer','pastor','pastor_wife'));
drop policy private_shares_select on report.private_shares;
create policy private_shares_select on report.private_shares for select to authenticated
  using(report.can_share_report(report_id) or (report.is_clergy() and minister_id=auth.uid()));
drop policy private_shares_insert on report.private_shares;
create policy private_shares_insert on report.private_shares for insert to authenticated
  with check(report.can_share_report(report_id) and shared_by=auth.uid() and exists(
    select 1 from report.profiles p where p.id=minister_id and p.status='active' and p.is_minister));
drop policy private_shares_delete on report.private_shares;
create policy private_shares_delete on report.private_shares for delete to authenticated using(report.can_share_report(report_id));
create function report.has_report_share(rid uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select report.is_clergy() and exists(select 1 from report.private_shares where report_id=rid and minister_id=auth.uid());
$$;
create or replace function report.can_view_group(gid uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select report.is_senior() or report.group_role(gid) is not null or (report.is_clergy() and exists(
    select 1 from report.reports r where r.group_id=gid and report.has_report_share(r.id)));
$$;
create or replace function report.can_write_group(gid uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select report.is_senior() or report.group_role(gid) is not null;
$$;
drop policy members_select on report.members;
create policy members_select on report.members for select to authenticated using(report.is_senior() or report.group_role(group_id) is not null);
drop policy week_status_select on report.week_status;
drop policy week_status_write on report.week_status;
create policy week_status_select on report.week_status for select to authenticated using(report.is_senior() or report.group_role(group_id) is not null);
create policy week_status_insert on report.week_status for insert to authenticated with check(report.can_write_group(group_id));
create policy week_status_update on report.week_status for update to authenticated using(report.can_write_group(group_id)) with check(report.can_write_group(group_id));
create policy week_status_delete on report.week_status for delete to authenticated using(report.can_write_group(group_id));
create or replace function report.can_review_group(gid uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select report.is_senior() or report.assigned_clergy(gid);
$$;
create or replace function report.can_view_report(rid uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select report.is_active_user() and exists(select 1 from report.reports r where r.id=rid and (
    report.is_senior() or report.group_role(r.group_id)='reviewer' or report.assigned_clergy(r.group_id)
    or (r.author_id=auth.uid() and report.group_role(r.group_id) is not null) or report.has_report_share(rid)));
$$;
drop policy reports_select on report.reports;
create policy reports_select on report.reports for select to authenticated using(report.is_active_user() and (
  report.is_senior() or report.group_role(group_id)='reviewer' or report.assigned_clergy(group_id)
  or (author_id=auth.uid() and report.group_role(group_id) is not null) or report.has_report_share(id)));

-- 공개받은 보고는 열람·피드백만 가능하며 파트 수정/검토 권한으로 승격되지 않는다.
create or replace function report.can_read_private(rid uuid,kind text) returns boolean
language sql stable security definer set search_path='' as $$
  select report.is_active_user() and exists(select 1 from report.reports r where r.id=rid and (
    report.is_senior() or report.assigned_clergy(r.group_id) or
    (r.author_id=auth.uid() and report.can_view_report(rid)) or (report.is_clergy() and exists(
      select 1 from report.private_shares s where s.report_id=rid and s.content_kind=kind and s.minister_id=auth.uid()))));
$$;

create table report.incident_shares (
  incident_id uuid not null references report.worship_incidents(id) on delete cascade,
  minister_id uuid not null references report.profiles(id),
  shared_by uuid not null default auth.uid() references report.profiles(id),
  created_at timestamptz not null default now(),
  primary key(incident_id,minister_id)
);
alter table report.incident_shares enable row level security;
revoke all on report.incident_shares from public,anon,authenticated;
grant select,insert,delete on report.incident_shares to authenticated;
create function report.can_share_incident(iid uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select report.is_senior() or exists(select 1 from report.worship_incidents i,unnest(i.group_ids) gid where i.id=iid and report.assigned_clergy(gid));
$$;
create policy incident_shares_select on report.incident_shares for select to authenticated using(report.can_share_incident(incident_id) or (report.is_clergy() and minister_id=auth.uid()));
create policy incident_shares_insert on report.incident_shares for insert to authenticated with check(report.can_share_incident(incident_id) and shared_by=auth.uid() and exists(select 1 from report.profiles p where p.id=minister_id and p.is_minister and p.status='active'));
create policy incident_shares_delete on report.incident_shares for delete to authenticated using(report.can_share_incident(incident_id));
-- 공유는 사건 ID로 검사한다. 같은 작성자/팀의 다른 사건까지 열리지 않는다.
create function report.can_view_incident(iid uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select report.is_active_user() and exists(select 1 from report.worship_incidents i where i.id=iid and (
    report.is_senior() or exists(select 1 from unnest(i.group_ids) gid where report.assigned_clergy(gid) or report.group_role(gid)='reviewer' or (i.author_id=auth.uid() and report.group_role(gid) is not null))
    or (report.is_clergy() and (report.has_report_share(i.report_id) or exists(select 1 from report.incident_shares s where s.incident_id=i.id and s.minister_id=auth.uid())))));
$$;
create or replace function report.can_read_incident(owner_id uuid,related uuid[]) returns boolean
language sql stable security definer set search_path='' as $$
  select report.is_active_user() and (report.is_senior() or exists(select 1 from unnest(related) gid where
    report.assigned_clergy(gid) or report.group_role(gid)='reviewer' or (owner_id=auth.uid() and report.group_role(gid) is not null)));
$$;
drop policy incidents_read on report.worship_incidents;
create policy incidents_read on report.worship_incidents for select to authenticated using(report.can_read_incident(author_id,group_ids) or report.can_view_incident(id));
create or replace function report.can_edit_incident(owner_id uuid,related uuid[]) returns boolean
language sql stable security definer set search_path='' as $$
  select report.is_active_user() and (report.is_senior() or exists(select 1 from unnest(related) gid where report.assigned_clergy(gid) or (owner_id=auth.uid() and report.group_role(gid) is not null)));
$$;

-- 최초 작성자 이름과 최종 수정 계정을 각각 남긴다. 같은 예배의 보고 수는 제한하지 않는다.
alter table report.reports add column author_name text;
alter table report.reports add column duty_part text not null default '' check(char_length(duty_part)<=100);
alter table report.reports add column last_edited_by uuid references report.profiles(id);
alter table report.reports disable trigger reports_updated_at;
update report.reports r set author_name=coalesce(nullif(btrim(r.details->'_report_meta'->>'author_name'),''),nullif(btrim(p.real_name),''),'기존 작성자 (이름 확인 필요)'), duty_part=coalesce(r.details->'_report_meta'->>'duty_part','') from report.profiles p where p.id=r.author_id;
alter table report.reports enable trigger reports_updated_at;
alter table report.reports alter column author_name set not null;
alter table report.reports add constraint reports_author_name_check check(char_length(btrim(author_name)) between 1 and 100);
create function report.stamp_report_identity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if TG_OP='UPDATE' and (new.author_id is distinct from old.author_id or new.author_name is distinct from old.author_name) then
    raise exception 'original author cannot change' using errcode='42501';
  end if;
  if TG_OP='INSERT' and nullif(btrim(new.author_name),'') is null then raise exception 'author name required'; end if;
  new.last_edited_by=auth.uid();
  return new;
end;
$$;
create trigger reports_identity before insert or update on report.reports for each row execute function report.stamp_report_identity();

-- 공지의 수신 직책은 작성/검토 동작과 구분한다. 이전 reviewer 공지는 검토 권한 의미를 보존한다.
alter table report.notices drop constraint notices_audience_check;
alter table report.notices add constraint notices_audience_check check(audience in ('all','reviewer','senior','minister','lead','member'));
create function report.notice_matches(p_notice uuid,p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from report.notices n join report.profiles p on p.id=p_user and p.status='active' where n.id=p_notice and (
    (n.audience='senior' and p.recipient_role is not null) or
    (n.audience<>'senior' and (n.audience='all' or (n.audience in ('reviewer','minister') and (p.is_minister or p.recipient_role is not null)) or
      (n.audience='lead' and not p.is_minister and p.recipient_role is null) or (n.audience='member' and not p.is_minister and p.recipient_role is null))
    and exists(select 1 from report.memberships m join report.groups g on g.id=m.group_id and g.is_active where m.user_id=p.id
      and (n.audience<>'lead' or m.role='reviewer') and (n.audience<>'member' or m.role='writer')
      and ((n.target_type is not null and g.type=n.target_type) or g.id=n.target_group_id or g.id=(select parent_id from report.groups where id=n.target_group_id))))));
$$;
create or replace function report.can_read_notice(p_notice uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select report.is_active_user() and (report.is_senior() or report.notice_matches(p_notice,auth.uid()) or exists(select 1 from report.notices where id=p_notice and author_id=auth.uid()));
$$;
create or replace function report.notice_recipients(p_notice uuid) returns table(user_id uuid)
language sql stable security definer set search_path='' as $$
  select p.id from report.profiles p where p.status='active' and p.notify_enabled and report.notice_matches(p_notice,p.id)
    and exists(select 1 from report.notices n where n.id=p_notice and n.author_id=auth.uid() and p.id<>n.author_id) and report.is_active_user();
$$;
revoke all on function report.assigned_clergy(uuid),report.can_share_report(uuid),report.has_report_share(uuid),report.can_share_incident(uuid),report.can_view_incident(uuid),report.notice_matches(uuid,uuid),report.stamp_report_identity() from public,anon;
grant execute on function report.assigned_clergy(uuid),report.can_share_report(uuid),report.has_report_share(uuid),report.can_share_incident(uuid),report.can_view_incident(uuid) to authenticated;
revoke all on function report.notice_matches(uuid,uuid) from authenticated;
