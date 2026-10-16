-- 교회 보고 시스템 초기 스키마
-- 원칙: 권한은 모두 RLS로 강제한다. 삭제 대신 비활성 처리로 과거 기록을 보존한다.
-- tlc-cellcare 프로젝트를 함께 쓰므로 모든 객체를 report 스키마에 두고, public(셀케어)과 auth 트리거는 건드리지 않는다.

create schema report;
grant usage on schema report to authenticated, service_role;
alter default privileges in schema report grant all on tables to authenticated, service_role;
alter default privileges in schema report grant all on sequences to authenticated, service_role;
alter default privileges in schema report grant execute on functions to authenticated, service_role;

-- ───────────────────────── 타입 ─────────────────────────
create type report.group_type as enum ('education', 'tech', 'other');
create type report.group_schedule as enum ('weekly', 'irregular');
create type report.profile_status as enum ('pending', 'active', 'disabled');
-- 순서가 권한 크기다: writer < reviewer (max()로 상위 역할을 고른다)
create type report.member_role as enum ('writer', 'reviewer');
create type report.report_status as enum ('draft', 'submitted', 'reviewed');
create type report.person_kind as enum ('student', 'teacher');
create type report.person_status as enum ('newcomer', 'active', 'inactive');
create type report.follow_up_status as enum ('new', 'contacted', 'settled', 'inactive');
create type report.issue_status as enum ('resolved', 'temporary', 'open');

-- ───────────────────────── 공통 트리거 ─────────────────────────
create function report.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ───────────────────────── 사용자 ─────────────────────────
create table report.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  real_name text check (char_length(real_name) between 1 and 30),
  requested_group_ids uuid[] not null default '{}',
  status report.profile_status not null default 'pending',
  is_admin boolean not null default false,
  notify_enabled boolean not null default true,
  approved_at timestamptz,
  approved_by uuid references report.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on report.profiles
  for each row execute function report.set_updated_at();

-- 보고 앱에 처음 로그인할 때 승인 대기 프로필을 만든다.
-- auth.users 트리거를 쓰지 않는 이유: 셀케어 가입자 전원의 프로필이 생기지 않게 하기 위해서다.
-- 실명은 셀케어 교인 명단(public.profiles)에 연결된 이름이 있으면 미리 채운다.
create function report.ensure_profile() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_name text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if exists (select 1 from report.profiles where id = v_uid) then
    return;
  end if;

  select u.email into v_email from auth.users u where u.id = v_uid;
  if to_regclass('public.profiles') is not null then
    begin
      execute 'select name from public.profiles where auth_user_id = $1 and active limit 1'
        into v_name using v_uid;
    exception when undefined_column then
      v_name := null; -- 셀케어 명단 구조가 바뀌어도 로그인은 막지 않는다
    end;
  end if;

  insert into report.profiles (id, email, real_name)
  values (v_uid, v_email, nullif(left(btrim(v_name), 30), ''))
  on conflict (id) do nothing;
end;
$$;
revoke execute on function report.ensure_profile() from public, anon;
grant execute on function report.ensure_profile() to authenticated;

-- ───────────────────────── 그룹 ─────────────────────────
create table report.groups (
  id uuid primary key default gen_random_uuid(),
  type report.group_type not null,
  name text not null check (char_length(name) between 1 and 50),
  parent_id uuid references report.groups (id),
  schedule report.group_schedule not null default 'weekly',
  settings jsonb not null default '{}',
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (parent_id is distinct from id)
);
create index groups_parent_idx on report.groups (parent_id);

create table report.memberships (
  user_id uuid not null references report.profiles (id) on delete cascade,
  group_id uuid not null references report.groups (id) on delete cascade,
  role report.member_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, group_id)
);
create index memberships_group_idx on report.memberships (group_id);

-- ───────────────────────── 예배·모임 종류 ─────────────────────────
create table report.service_types (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('주일', '라이프라인', '기타')),
  name text not null check (char_length(name) between 1 and 50),
  weekday smallint check (weekday between 0 and 6), -- 0=일 … 6=토
  sort_order int not null default 0,
  is_active boolean not null default true
);

create table report.group_service_types (
  group_id uuid not null references report.groups (id) on delete cascade,
  service_type_id uuid not null references report.service_types (id) on delete cascade,
  primary key (group_id, service_type_id)
);

-- 부서 고유 모임 (예: 중고등부 토요모임)
create table report.group_meeting_types (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references report.groups (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 50),
  weekday smallint check (weekday between 0 and 6),
  sort_order int not null default 0,
  is_active boolean not null default true
);

-- ───────────────────────── 보고 ─────────────────────────
create table report.reports (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references report.groups (id),
  author_id uuid not null references report.profiles (id),
  meeting_date date not null,
  -- 주차 = 그 주(월~일)의 일요일
  week date generated always as (meeting_date + ((7 - extract(isodow from meeting_date)::int) % 7)) stored,
  service_type_id uuid references report.service_types (id),
  group_meeting_type_id uuid references report.group_meeting_types (id),
  meeting_label text check (char_length(meeting_label) <= 50), -- 행사 직접 입력
  status report.report_status not null default 'draft',
  details jsonb not null default '{}',
  enrolled_snapshot int check (enrolled_snapshot >= 0),
  attend_snapshot int check (attend_snapshot >= 0),
  submitted_at timestamptz,
  reviewed_by uuid references report.profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(service_type_id, group_meeting_type_id, meeting_label) >= 1)
);
create index reports_group_week_idx on report.reports (group_id, week);
create index reports_author_idx on report.reports (author_id);
create trigger reports_updated_at before update on report.reports
  for each row execute function report.set_updated_at();

create function report.stamp_report_status() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status is distinct from 'submitted') then
    new.submitted_at := coalesce(new.submitted_at, now());
  end if;
  if new.status = 'reviewed' and (tg_op = 'INSERT' or old.status is distinct from 'reviewed') then
    new.reviewed_at := now();
    new.reviewed_by := auth.uid();
  end if;
  if new.status <> 'reviewed' then
    new.reviewed_at := null;
    new.reviewed_by := null;
  end if;
  return new;
end;
$$;
create trigger reports_stamp_status before insert or update on report.reports
  for each row execute function report.stamp_report_status();

-- 기도제목은 열람 범위가 좁아서 별도 테이블로 분리 (작성자 본인, 검토자, 관리자)
create table report.report_prayers (
  report_id uuid primary key references report.reports (id) on delete cascade,
  body text not null check (char_length(body) <= 1000)
);

-- 그 주 모임 없음 표시
create table report.week_status (
  group_id uuid not null references report.groups (id) on delete cascade,
  week date not null check (extract(isodow from week) = 7),
  no_meeting boolean not null default true,
  reason text check (char_length(reason) <= 100),
  set_by uuid references report.profiles (id),
  updated_at timestamptz not null default now(),
  primary key (group_id, week)
);

-- ───────────────────────── 교육부서 명단·출결 ─────────────────────────
create table report.members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references report.groups (id),
  name text not null check (char_length(name) between 1 and 30),
  kind report.person_kind not null default 'student',
  class_name text check (char_length(class_name) <= 30),
  grade text check (char_length(grade) <= 20),
  birth_year smallint check (birth_year between 1900 and 2100),
  status report.person_status not null default 'active',
  first_visit_date date,
  follow_up_status report.follow_up_status,
  follow_up_note text check (char_length(follow_up_note) <= 1000),
  left_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index members_group_idx on report.members (group_id, status);
create trigger members_updated_at before update on report.members
  for each row execute function report.set_updated_at();

-- 보호자 연락처는 열람 범위가 좁아서 별도 테이블 (검토자, 관리자)
create table report.member_guardians (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references report.members (id) on delete cascade,
  slot smallint not null check (slot in (1, 2)),
  name text check (char_length(name) <= 30),
  relation text check (relation in ('부', '모', '조부모', '기타')),
  contact text check (char_length(contact) <= 20),
  note text check (char_length(note) <= 100),
  consent boolean not null default false, -- 후속 연락 목적 수집 동의
  unique (member_id, slot)
);

create table report.attendance (
  report_id uuid not null references report.reports (id) on delete cascade,
  member_id uuid not null references report.members (id),
  present boolean not null default false,
  absence_reason text check (char_length(absence_reason) <= 100),
  contacted boolean not null default false,
  guardian_present boolean not null default false,
  primary key (report_id, member_id)
);
create index attendance_member_idx on report.attendance (member_id);

-- ───────────────────────── 이슈·코멘트·첨부 ─────────────────────────
create table report.report_issues (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references report.reports (id) on delete cascade,
  category text not null check (char_length(category) between 1 and 30),
  content text not null check (char_length(content) between 1 and 1000),
  status report.issue_status not null default 'open',
  action text check (char_length(action) <= 1000),
  updated_by uuid references report.profiles (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index report_issues_report_idx on report.report_issues (report_id);
create index report_issues_open_idx on report.report_issues (status) where status <> 'resolved';

create table report.report_comments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references report.reports (id) on delete cascade,
  author_id uuid not null references report.profiles (id),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index report_comments_report_idx on report.report_comments (report_id);

create table report.attachments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references report.reports (id) on delete cascade,
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

-- ───────────────────────── 알림·설정 ─────────────────────────
create table report.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references report.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device_label text check (char_length(device_label) <= 100),
  last_success_at timestamptz,
  created_at timestamptz not null default now()
);

-- 서버(service role)만 사용. 크론 재시도 시 중복 발송 방지
create table report.notification_logs (
  user_id uuid not null references report.profiles (id) on delete cascade,
  week date not null,
  slot text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, week, slot)
);

create table report.app_settings (
  key text primary key,
  value jsonb not null
);

-- ───────────────────────── 권한 함수 ─────────────────────────
create function report.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from report.profiles p where p.id = auth.uid() and p.status = 'active'
  );
$$;

create function report.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from report.profiles p
    where p.id = auth.uid() and p.status = 'active' and p.is_admin
  );
$$;

-- 그룹 자신과 모든 상위 그룹의 소속 중 가장 큰 역할 (상위 그룹 권한이 하위로 상속)
create function report.group_role(gid uuid) returns report.member_role
language sql stable security definer set search_path = '' as $$
  with recursive chain (id, parent_id) as (
    select g.id, g.parent_id from report.groups g where g.id = gid
    union
    select g.id, g.parent_id from report.groups g join chain c on g.id = c.parent_id
  )
  select max(m.role)
  from report.memberships m
  join chain c on c.id = m.group_id
  where m.user_id = auth.uid()
    and report.is_active_user();
$$;

create function report.can_view_group(gid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select report.is_admin() or report.group_role(gid) is not null;
$$;

create function report.can_write_group(gid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select report.is_admin() or report.group_role(gid) is not null;
$$;

create function report.can_review_group(gid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select report.is_admin() or report.group_role(gid) = 'reviewer';
$$;

create function report.can_view_report(rid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from report.reports r where r.id = rid and report.can_view_group(r.group_id)
  );
$$;

-- 작성자 본인(확인 전) 또는 검토자
create function report.can_edit_report(rid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from report.reports r
    where r.id = rid
      and (
        report.can_review_group(r.group_id)
        or (r.author_id = auth.uid() and r.status <> 'reviewed' and report.can_write_group(r.group_id))
      )
  );
$$;

create function report.can_review_report(rid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from report.reports r where r.id = rid and report.can_review_group(r.group_id)
  );
$$;

create function report.member_group(mid uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.group_id from report.members m where m.id = mid;
$$;

-- ───────────────────────── 관리자 RPC ─────────────────────────
-- 가입 승인: 상태 변경과 소속 배정을 한 번에
create function report.approve_user(p_user uuid, p_assignments jsonb, p_make_admin boolean default false)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  a jsonb;
begin
  if not report.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(p_assignments) <> 'array' then
    raise exception 'assignments must be an array';
  end if;

  update report.profiles
     set status = 'active', is_admin = p_make_admin or is_admin,
         approved_at = now(), approved_by = auth.uid()
   where id = p_user;
  if not found then
    raise exception 'user not found';
  end if;

  for a in select * from jsonb_array_elements(p_assignments) loop
    insert into report.memberships (user_id, group_id, role)
    values (p_user, (a ->> 'group_id')::uuid, (a ->> 'role')::report.member_role)
    on conflict (user_id, group_id) do update set role = excluded.role;
  end loop;
end;
$$;

create function report.set_user_status(p_user uuid, p_status report.profile_status)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not report.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'cannot change own status';
  end if;
  update report.profiles set status = p_status where id = p_user;
end;
$$;

revoke execute on function report.approve_user(uuid, jsonb, boolean) from public, anon;
revoke execute on function report.set_user_status(uuid, report.profile_status) from public, anon;
grant execute on function report.approve_user(uuid, jsonb, boolean) to authenticated;
grant execute on function report.set_user_status(uuid, report.profile_status) to authenticated;

-- ───────────────────────── RLS ─────────────────────────
alter table report.profiles enable row level security;
alter table report.groups enable row level security;
alter table report.memberships enable row level security;
alter table report.service_types enable row level security;
alter table report.group_service_types enable row level security;
alter table report.group_meeting_types enable row level security;
alter table report.reports enable row level security;
alter table report.report_prayers enable row level security;
alter table report.week_status enable row level security;
alter table report.members enable row level security;
alter table report.member_guardians enable row level security;
alter table report.attendance enable row level security;
alter table report.report_issues enable row level security;
alter table report.report_comments enable row level security;
alter table report.attachments enable row level security;
alter table report.push_subscriptions enable row level security;
alter table report.notification_logs enable row level security; -- 정책 없음 = service role 전용
alter table report.app_settings enable row level security;

-- profiles: 본인은 항상, 승인된 사용자는 서로의 이름을 볼 수 있다
create policy profiles_select on report.profiles for select to authenticated
  using (id = auth.uid() or report.is_active_user());
create policy profiles_update_self on report.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- 본인이 바꿀 수 있는 컬럼만 허용 (status, is_admin은 관리자 RPC로만)
revoke insert, update, delete on report.profiles from anon, authenticated;
grant update (real_name, requested_group_ids, notify_enabled) on report.profiles to authenticated;

-- groups: 가입 신청 화면에서 그룹 목록이 필요하므로 로그인 사용자 전체 열람
create policy groups_select on report.groups for select to authenticated using (true);
create policy groups_admin on report.groups for all to authenticated
  using (report.is_admin()) with check (report.is_admin());

create policy memberships_select on report.memberships for select to authenticated
  using (user_id = auth.uid() or report.can_review_group(group_id));
create policy memberships_admin on report.memberships for all to authenticated
  using (report.is_admin()) with check (report.is_admin());

create policy service_types_select on report.service_types for select to authenticated
  using (report.is_active_user());
create policy service_types_admin on report.service_types for all to authenticated
  using (report.is_admin()) with check (report.is_admin());

create policy group_service_types_select on report.group_service_types for select to authenticated
  using (report.is_active_user());
create policy group_service_types_admin on report.group_service_types for all to authenticated
  using (report.is_admin()) with check (report.is_admin());

create policy group_meeting_types_select on report.group_meeting_types for select to authenticated
  using (report.can_view_group(group_id));
create policy group_meeting_types_write on report.group_meeting_types for all to authenticated
  using (report.can_review_group(group_id)) with check (report.can_review_group(group_id));

-- reports
create policy reports_select on report.reports for select to authenticated
  using (report.can_view_group(group_id));
create policy reports_insert on report.reports for insert to authenticated
  with check (
    author_id = auth.uid()
    and status in ('draft', 'submitted')
    and report.can_write_group(group_id)
  );
create policy reports_update_author on report.reports for update to authenticated
  using (author_id = auth.uid() and status <> 'reviewed' and report.can_write_group(group_id))
  with check (author_id = auth.uid() and status in ('draft', 'submitted') and report.can_write_group(group_id));
create policy reports_update_reviewer on report.reports for update to authenticated
  using (report.can_review_group(group_id))
  with check (report.can_review_group(group_id));
create policy reports_delete on report.reports for delete to authenticated
  using ((author_id = auth.uid() and status = 'draft') or report.is_admin());

create policy report_prayers_select on report.report_prayers for select to authenticated
  using (
    report.can_review_report(report_id)
    or exists (select 1 from report.reports r where r.id = report_id and r.author_id = auth.uid())
  );
create policy report_prayers_write on report.report_prayers for all to authenticated
  using (report.can_edit_report(report_id)) with check (report.can_edit_report(report_id));

create policy week_status_select on report.week_status for select to authenticated
  using (report.can_view_group(group_id));
create policy week_status_write on report.week_status for all to authenticated
  using (report.can_write_group(group_id)) with check (report.can_write_group(group_id));

-- members: 작성자(교사)는 새친구 추가와 새친구 후속 관리만, 나머지는 검토자
create policy members_select on report.members for select to authenticated
  using (report.can_view_group(group_id));
create policy members_insert on report.members for insert to authenticated
  with check (
    report.can_review_group(group_id)
    or (report.can_write_group(group_id) and status = 'newcomer')
  );
create policy members_update_reviewer on report.members for update to authenticated
  using (report.can_review_group(group_id)) with check (report.can_review_group(group_id));
create policy members_update_writer on report.members for update to authenticated
  using (report.can_write_group(group_id) and status = 'newcomer')
  with check (report.can_write_group(group_id) and status = 'newcomer');
create policy members_delete on report.members for delete to authenticated
  using (report.is_admin());

-- 보호자: 작성자는 새친구 등록 시 입력만 가능, 열람은 검토자
create policy member_guardians_select on report.member_guardians for select to authenticated
  using (report.can_review_group(report.member_group(member_id)));
create policy member_guardians_insert on report.member_guardians for insert to authenticated
  with check (report.can_write_group(report.member_group(member_id)));
create policy member_guardians_update on report.member_guardians for update to authenticated
  using (report.can_review_group(report.member_group(member_id)))
  with check (report.can_review_group(report.member_group(member_id)));
create policy member_guardians_delete on report.member_guardians for delete to authenticated
  using (report.can_review_group(report.member_group(member_id)));

create policy attendance_select on report.attendance for select to authenticated
  using (report.can_view_report(report_id));
create policy attendance_write on report.attendance for all to authenticated
  using (report.can_edit_report(report_id)) with check (report.can_edit_report(report_id));

create policy report_issues_select on report.report_issues for select to authenticated
  using (report.can_view_report(report_id));
create policy report_issues_write on report.report_issues for all to authenticated
  using (report.can_edit_report(report_id)) with check (report.can_edit_report(report_id));

create policy report_comments_select on report.report_comments for select to authenticated
  using (report.can_view_report(report_id));
create policy report_comments_insert on report.report_comments for insert to authenticated
  with check (author_id = auth.uid() and report.can_view_report(report_id));
create policy report_comments_delete on report.report_comments for delete to authenticated
  using (author_id = auth.uid() or report.is_admin());

create policy attachments_select on report.attachments for select to authenticated
  using (report.can_view_report(report_id));
create policy attachments_write on report.attachments for all to authenticated
  using (report.can_edit_report(report_id)) with check (report.can_edit_report(report_id));

create policy push_subscriptions_own on report.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy app_settings_select on report.app_settings for select to authenticated
  using (report.is_active_user());
create policy app_settings_admin on report.app_settings for all to authenticated
  using (report.is_admin()) with check (report.is_admin());

-- 익명 사용자는 어떤 테이블도 직접 접근하지 않는다
revoke all on all tables in schema report from anon;
