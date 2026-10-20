-- 기능 관리와 목회 열람 권한은 서로 독립적이다. 기존 관리자에게 내용 권한을 부여하지 않는다.
alter table report.profiles add column is_minister boolean not null default false;

create function report.is_senior() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from report.profiles where id=auth.uid() and status='active' and recipient_role is not null);
$$;
create function report.is_clergy() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from report.profiles where id=auth.uid() and status='active' and (is_minister or recipient_role is not null));
$$;
-- 기존 관리 RPC도 최상단에서 사용할 수 있게 하되 내용 정책에서는 이 함수를 사용하지 않는다.
create or replace function report.is_admin() returns boolean
language sql stable security definer set search_path='' as $$
  select report.is_senior() or exists(select 1 from report.profiles where id=auth.uid() and status='active' and is_admin);
$$;
create or replace function report.can_view_group(gid uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select report.is_clergy() or report.group_role(gid) is not null;
$$;
create or replace function report.can_write_group(gid uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select report.is_clergy() or coalesce(report.group_role(gid)='writer',false);
$$;
create or replace function report.can_review_group(gid uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select report.is_clergy();
$$;
create or replace function report.can_view_report(rid uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select report.is_active_user() and exists(select 1 from report.reports r where r.id=rid and
    (report.is_clergy() or report.group_role(r.group_id)='reviewer' or
      (r.author_id=auth.uid() and report.group_role(r.group_id)='writer')));
$$;
drop policy reports_select on report.reports;
create policy reports_select on report.reports for select to authenticated using (report.is_active_user() and
  (report.is_clergy() or report.group_role(group_id)='reviewer' or (author_id=auth.uid() and report.group_role(group_id)='writer')));
drop policy reports_delete on report.reports;
create policy reports_delete on report.reports for delete to authenticated
  using (report.is_senior() or (report.is_active_user() and author_id=auth.uid() and status='draft' and report.can_write_group(group_id)));
drop policy members_delete on report.members;
create policy members_delete on report.members for delete to authenticated using (report.is_senior());
drop policy report_comments_insert on report.report_comments;
create policy report_comments_insert on report.report_comments for insert to authenticated
  with check (author_id=auth.uid() and report.is_clergy() and report.can_view_report(report_id));
drop policy report_comments_delete on report.report_comments;
create policy report_comments_delete on report.report_comments for delete to authenticated
  using (report.can_view_report(report_id) and (report.is_senior() or (report.is_clergy() and author_id=auth.uid())));

-- 한 보고 전체가 아니라 기도제목/수신인별 글을 각각 공개한다.
create table report.private_shares (
  report_id uuid not null references report.reports(id) on delete cascade,
  content_kind text not null check(content_kind in ('prayer','pastor','pastor_wife')),
  minister_id uuid not null references report.profiles(id),
  shared_by uuid not null default auth.uid() references report.profiles(id),
  created_at timestamptz not null default now(),
  primary key(report_id,content_kind,minister_id)
);
alter table report.private_shares enable row level security;
revoke all on report.private_shares from public,anon,authenticated;
grant select,insert,delete on report.private_shares to authenticated;
create policy private_shares_select on report.private_shares for select to authenticated
  using (report.is_senior() or (report.is_clergy() and minister_id=auth.uid()));
create policy private_shares_insert on report.private_shares for insert to authenticated
  with check (report.is_senior() and shared_by=auth.uid() and exists(
    select 1 from report.profiles p where p.id=minister_id and p.status='active' and p.is_minister));
create policy private_shares_delete on report.private_shares for delete to authenticated using(report.is_senior());
create function report.can_read_private(rid uuid,kind text) returns boolean
language sql stable security definer set search_path='' as $$
  select report.is_active_user() and exists(select 1 from report.reports r where r.id=rid and (
    report.is_senior() or (r.author_id=auth.uid() and report.can_view_report(rid)) or
    (report.is_clergy() and (report.group_role(r.group_id)='reviewer' or exists(
      select 1 from report.private_shares s where s.report_id=rid and s.content_kind=kind and s.minister_id=auth.uid())))
  ));
$$;
drop policy report_prayers_select on report.report_prayers;
drop policy report_prayers_write on report.report_prayers;
create policy report_prayers_select on report.report_prayers for select to authenticated using(report.can_read_private(report_id,'prayer'));
create policy report_prayers_insert on report.report_prayers for insert to authenticated
  with check(report.can_edit_report(report_id) and report.can_read_private(report_id,'prayer'));
create policy report_prayers_update on report.report_prayers for update to authenticated
  using(report.can_edit_report(report_id) and report.can_read_private(report_id,'prayer'))
  with check(report.can_edit_report(report_id) and report.can_read_private(report_id,'prayer'));
create policy report_prayers_delete on report.report_prayers for delete to authenticated
  using(report.can_edit_report(report_id) and report.can_read_private(report_id,'prayer'));
drop policy report_messages_select on report.report_messages;
create policy report_messages_select on report.report_messages for select to authenticated
  using(report.can_read_private(report_id,recipient::text));
-- 기존 author 전용 쓰기 정책은 유지한다.

create or replace function report.can_read_incident(owner_id uuid, related uuid[]) returns boolean
language sql stable security definer set search_path='' as $$
  select report.is_active_user() and (report.is_clergy() or exists(select 1 from unnest(related) gid
    where report.group_role(gid)='reviewer' or (owner_id=auth.uid() and report.group_role(gid)='writer')));
$$;
create function report.can_edit_incident(owner_id uuid,related uuid[]) returns boolean
language sql stable security definer set search_path='' as $$
  select report.is_active_user() and (report.is_clergy() or (owner_id=auth.uid() and
    exists(select 1 from unnest(related) gid where report.can_write_group(gid))));
$$;
drop policy incidents_insert on report.worship_incidents;
create policy incidents_insert on report.worship_incidents for insert to authenticated
  with check(author_id=auth.uid() and report.can_edit_incident(author_id,group_ids));
drop policy incidents_update on report.worship_incidents;
create policy incidents_update on report.worship_incidents for update to authenticated
  using(report.can_edit_incident(author_id,group_ids)) with check(report.can_edit_incident(author_id,group_ids));
create table report.incident_comments (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references report.worship_incidents(id) on delete cascade,
  author_id uuid not null references report.profiles(id),
  body text not null check(char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index incident_comments_incident_idx on report.incident_comments(incident_id,created_at);
alter table report.incident_comments enable row level security;
revoke all on report.incident_comments from public,anon,authenticated;
grant select,insert,delete on report.incident_comments to authenticated;
create policy incident_comments_select on report.incident_comments for select to authenticated
  using(exists(select 1 from report.worship_incidents i where i.id=incident_id));
create policy incident_comments_insert on report.incident_comments for insert to authenticated
  with check(author_id=auth.uid() and report.is_clergy() and exists(select 1 from report.worship_incidents i where i.id=incident_id));
create policy incident_comments_delete on report.incident_comments for delete to authenticated
  using(report.is_clergy() and (author_id=auth.uid() or report.is_senior()) and exists(select 1 from report.worship_incidents i where i.id=incident_id));

-- 관리자가 본인 소속을 바꿔 내용 열람 권한을 얻는 경로를 막는다.
create function report.protect_content_roles() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is not null and not report.is_senior() then
    if TG_TABLE_NAME='profiles' then
      if new.is_minister is distinct from old.is_minister or new.recipient_role is distinct from old.recipient_role then
        raise exception 'senior permission required' using errcode='42501';
      end if;
    elsif (case when TG_OP='DELETE' then old.user_id else new.user_id end)=auth.uid() then
      raise exception 'cannot change own content assignments' using errcode='42501';
    end if;
  end if;
  if TG_OP='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger protect_profile_content_roles before update on report.profiles for each row execute function report.protect_content_roles();
create trigger protect_own_memberships before insert or update or delete on report.memberships for each row execute function report.protect_content_roles();
create function report.set_minister(p_user uuid,p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not report.is_senior() then raise exception 'forbidden' using errcode='42501'; end if;
  update report.profiles set is_minister=p_enabled where id=p_user and status='active';
  if not found then raise exception 'active user required'; end if;
end;
$$;
-- 기존 수신인 지정 RPC도 위 트리거를 거치므로 최상단만 변경할 수 있다.
create or replace function report.can_read_notice(p_notice uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select report.is_active_user() and exists(select 1 from report.notices n where n.id=p_notice and
    (report.is_clergy() or n.author_id=auth.uid() or exists(
      select 1 from report.memberships m join report.groups g on g.id=m.group_id and g.is_active
      where m.user_id=auth.uid() and (n.audience='all' or m.role='reviewer') and
       ((n.target_type is not null and g.type=n.target_type) or g.id=n.target_group_id or
        g.id=(select parent_id from report.groups where id=n.target_group_id)))));
$$;
drop policy notices_insert on report.notices;
create policy notices_insert on report.notices for insert to authenticated with check(
  report.is_active_user() and author_id=auth.uid() and (report.is_admin() or report.is_clergy()) and
  (target_group_id is null or exists(select 1 from report.groups where id=target_group_id and is_active)));
create or replace function report.notice_recipients(p_notice uuid) returns table(user_id uuid)
language sql stable security definer set search_path='' as $$
  select distinct p.id from report.notices n join report.profiles p on p.status='active' and p.notify_enabled
  where n.id=p_notice and report.is_active_user() and (n.author_id=auth.uid() or report.is_clergy())
    and p.id<>n.author_id and (p.is_minister or p.recipient_role is not null or exists(
      select 1 from report.memberships m join report.groups g on g.id=m.group_id and g.is_active
      where m.user_id=p.id and (n.audience='all' or m.role='reviewer') and
       ((n.target_type is not null and g.type=n.target_type) or g.id=n.target_group_id or
        g.id=(select parent_id from report.groups where id=n.target_group_id))));
$$;

-- TRUNCATE는 RLS를 우회하므로 클라이언트 역할에 제공하지 않는다.
revoke truncate on all tables in schema report from authenticated,anon;

revoke all on function report.is_senior(),report.is_clergy(),report.can_read_private(uuid,text),
  report.can_edit_incident(uuid,uuid[]),report.set_minister(uuid,boolean),report.protect_content_roles() from public,anon;
grant execute on function report.is_senior(),report.is_clergy(),report.can_read_private(uuid,text),
  report.can_edit_incident(uuid,uuid[]),report.set_minister(uuid,boolean) to authenticated;

-- 담당이 아닌 교역자가 일반 보고를 수정해도 숨겨진 기도제목은 보존한다.
do $$
declare body text;
begin
  body=pg_get_functiondef('report.save_report(uuid,jsonb,report.report_status)'::regprocedure);
  if position('if p_payload ? ''prayer'' then' in body)=0 then raise exception 'unexpected prayer branch'; end if;
  body=replace(body,'if p_payload ? ''prayer'' then',
    'if p_payload ? ''prayer'' and report.can_read_private(p_report,''prayer'') then');
  execute body;
end;
$$;
