-- 기술팀은 보고할 일이 있을 때 작성하며 모임 유무·미제출 독촉 대상에서 제외한다.
update report.groups set schedule = 'irregular' where type = 'worship';

create table report.notices (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references report.profiles(id),
  target_type report.group_type,
  target_group_id uuid references report.groups(id),
  audience text not null default 'all' check (audience in ('all','reviewer')),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  check (num_nonnulls(target_type,target_group_id) = 1)
);
create index notices_created_idx on report.notices(created_at desc);
create table report.notice_comments (
  id uuid primary key default gen_random_uuid(),
  notice_id uuid not null references report.notices(id) on delete cascade,
  author_id uuid not null references report.profiles(id),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index notice_comments_notice_idx on report.notice_comments(notice_id,created_at);
alter table report.notices enable row level security;
alter table report.notice_comments enable row level security;
revoke all on report.notices, report.notice_comments from anon;
grant select, insert on report.notices, report.notice_comments to authenticated;

create function report.can_read_notice(p_notice uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from report.notices n join report.profiles p on p.id=auth.uid() and p.status='active'
    where n.id=p_notice and (p.is_admin or n.author_id=p.id or exists (
      select 1 from report.memberships m join report.groups g on g.id=m.group_id and g.is_active
      where m.user_id=p.id and (n.audience='all' or m.role='reviewer')
        and ((n.target_type is not null and g.type=n.target_type)
          or g.id=n.target_group_id
          or g.id=(select parent_id from report.groups where id=n.target_group_id))
    ))
  );
$$;
revoke all on function report.can_read_notice(uuid) from public,anon;
grant execute on function report.can_read_notice(uuid) to authenticated;

-- INSERT RETURNING 시 새 행은 STABLE 함수의 조회에 아직 보이지 않으므로 작성자는 행 값으로 확인한다.
create policy notices_read on report.notices for select to authenticated
  using (report.is_active_user() and (author_id=auth.uid() or report.can_read_notice(id)));
create policy notices_insert on report.notices for insert to authenticated with check (
  report.is_active_user() and author_id=auth.uid()
  and (report.is_admin() or (target_group_id is not null and report.can_review_group(target_group_id)))
  and (target_group_id is null or exists(select 1 from report.groups where id=target_group_id and is_active))
);
create policy notice_comments_read on report.notice_comments for select to authenticated using (report.can_read_notice(notice_id));
create policy notice_comments_insert on report.notice_comments for insert to authenticated
  with check (author_id=auth.uid() and report.can_read_notice(notice_id));

-- 저장한 공지에서 발송 대상을 계산해 브라우저가 임의의 사용자에게 알림을 보내지 못하게 한다.
create function report.notice_recipients(p_notice uuid) returns table(user_id uuid)
language sql stable security definer set search_path = '' as $$
  select distinct p.id from report.notices n
  join report.profiles p on p.status='active' and p.notify_enabled
  where n.id=p_notice and report.is_active_user() and (n.author_id=auth.uid() or report.is_admin())
    and p.id<>n.author_id and (p.is_admin or exists (
      select 1 from report.memberships m join report.groups g on g.id=m.group_id and g.is_active
      where m.user_id=p.id and (n.audience='all' or m.role='reviewer')
        and ((n.target_type is not null and g.type=n.target_type) or g.id=n.target_group_id
          or g.id=(select parent_id from report.groups where id=n.target_group_id))
    ));
$$;
revoke all on function report.notice_recipients(uuid) from public,anon;
grant execute on function report.notice_recipients(uuid) to authenticated;

-- 모임 없음은 교육·학교만 사유와 함께 등록한다. 날짜 조작도 DB에서 차단한다.
create function report.validate_no_meeting() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.no_meeting then
    if not exists(select 1 from report.groups where id=new.group_id and type in ('education','other') and is_active) then
      raise exception '교육부서와 학교만 모임 없음을 등록할 수 있습니다';
    end if;
    if nullif(btrim(new.reason),'') is null then raise exception '사유를 입력해 주세요'; end if;
    if new.week > ((now() at time zone 'Asia/Seoul')::date - extract(dow from now() at time zone 'Asia/Seoul')::int) then
      raise exception '미래 주차에는 등록할 수 없습니다';
    end if;
  end if;
  return new;
end;
$$;
create trigger validate_no_meeting before insert or update on report.week_status
for each row execute function report.validate_no_meeting();
