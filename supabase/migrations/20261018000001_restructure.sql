-- 3차 (2/2): 조직 재구성, 부산 캠퍼스 보고, 담임목사님·사모님께 드리는 글, 언어 설정
-- 데이터 변경은 이름으로 찾아서 하므로 새로 설치하는 DB(행이 없음)에서도 문제없이 지나간다.

-- ───────────── 예배 이름: 구분 칸이 없어졌으므로 '라이프라인'을 이름에 붙인다 ─────────────
update report.service_types set name = '라이프라인 수요예배' where name = '수요예배';
update report.service_types set name = '라이프라인 금요예배' where name = '금요예배';

-- ───────────── 예배팀 재구성 (분당) ─────────────
update report.groups set name = '예배팀' where name = '기술팀' and parent_id is null;
update report.groups set is_active = false where name = '사진'
  and parent_id = (select id from report.groups where name = '예배팀' and parent_id is null);

insert into report.groups (type, name, parent_id, schedule, sort_order)
select 'worship', v.name, p.id, 'weekly', v.sort_order
from (values ('음향', 1), ('영상', 2), ('조명', 3), ('자막', 4), ('음원', 5),
             ('웰컴', 6), ('성찬', 7), ('성찬준비', 8), ('새가족', 9), ('새가족케어', 10)) as v (name, sort_order)
cross join (select id from report.groups where name = '예배팀' and parent_id is null) p
where not exists (select 1 from report.groups g where g.name = v.name and g.parent_id = p.id);

update report.groups g set sort_order = v.sort_order
from (values ('음향', 1), ('영상', 2), ('조명', 3), ('자막', 4), ('음원', 5),
             ('웰컴', 6), ('성찬', 7), ('성찬준비', 8), ('새가족', 9), ('새가족케어', 10)) as v (name, sort_order)
where g.name = v.name and g.parent_id = (select id from report.groups where name = '예배팀' and parent_id is null);

-- 예배팀 각 팀은 공통 예배 전체를 사용
insert into report.group_service_types (group_id, service_type_id)
select g.id, s.id
from report.groups g
join report.groups p on p.id = g.parent_id and p.name = '예배팀' and p.parent_id is null
cross join report.service_types s
where s.is_active
on conflict do nothing;

-- ───────────── 교육부서 재구성 (분당) ─────────────
update report.groups set name = '영유아부' where name = '영아부'
  and parent_id = (select id from report.groups where name = '교육부' and parent_id is null);
update report.groups set is_active = false where name = '유아부'
  and parent_id = (select id from report.groups where name = '교육부' and parent_id is null);
update report.groups set name = '중등부' where name = '중고등부'
  and parent_id = (select id from report.groups where name = '교육부' and parent_id is null);

insert into report.groups (type, name, parent_id, schedule, sort_order)
select 'education', v.name, p.id, 'weekly', v.sort_order
from (values ('영어예배', 6), ('고등부', 8)) as v (name, sort_order)
cross join (select id from report.groups where name = '교육부' and parent_id is null) p
where not exists (select 1 from report.groups g where g.name = v.name and g.parent_id = p.id);

update report.groups g set sort_order = v.sort_order
from (values ('영유아부', 1), ('유치부', 2), ('유년부', 3), ('초등부', 4), ('소년부', 5),
             ('영어예배', 6), ('중등부', 7), ('고등부', 8)) as v (name, sort_order)
where g.name = v.name and g.parent_id = (select id from report.groups where name = '교육부' and parent_id is null);

-- ───────────── 부산 캠퍼스 ─────────────
-- 방문하는 교역자가 작성자로 배정되어 방문 한 번에 보고 1건을 쓴다
insert into report.groups (type, name, schedule, sort_order)
select 'campus', '부산 캠퍼스', 'irregular', 3
where not exists (select 1 from report.groups where name = '부산 캠퍼스' and parent_id is null);

-- ───────────── 언어 설정 ─────────────
alter table report.profiles add column locale text not null default 'ko' check (locale in ('ko', 'en'));
grant update (locale) on report.profiles to authenticated;

-- ───────────── 담임목사님·사모님께 드리는 글 ─────────────
create type report.message_recipient as enum ('pastor', 'pastor_wife');

-- 받는 분은 각각 한 명. 관리자가 지정한다.
alter table report.profiles add column recipient_role report.message_recipient unique;

create table report.report_messages (
  report_id uuid not null references report.reports (id) on delete cascade,
  recipient report.message_recipient not null,
  body text not null check (char_length(body) between 1 and 2000),
  updated_at timestamptz not null default now(),
  primary key (report_id, recipient)
);
alter table report.report_messages enable row level security;

create function report.my_recipient_role() returns report.message_recipient
language sql stable security definer set search_path = '' as $$
  select p.recipient_role from report.profiles p where p.id = auth.uid() and p.status = 'active';
$$;

create function report.is_report_author(rid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from report.reports r where r.id = rid and r.author_id = auth.uid());
$$;

-- 작성자와 받는 분만 볼 수 있다 (관리자·검토자도 볼 수 없음)
create policy report_messages_select on report.report_messages for select to authenticated
  using (report.is_report_author(report_id) or recipient = report.my_recipient_role());
-- 쓰기는 작성자 본인만, 확인 처리 전까지
create policy report_messages_write on report.report_messages for all to authenticated
  using (report.is_report_author(report_id) and report.can_edit_report(report_id))
  with check (report.is_report_author(report_id) and report.can_edit_report(report_id));

create function report.set_recipient_role(p_user uuid, p_role report.message_recipient)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not report.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_role is not null then
    update report.profiles set recipient_role = null where recipient_role = p_role and id <> p_user;
  end if;
  update report.profiles set recipient_role = p_role where id = p_user and status = 'active';
  if not found then
    raise exception 'active user not found';
  end if;
end;
$$;
revoke execute on function report.set_recipient_role(uuid, report.message_recipient) from public, anon;
grant execute on function report.set_recipient_role(uuid, report.message_recipient) to authenticated;
