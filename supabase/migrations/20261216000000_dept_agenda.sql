-- DB 56: 부서 안건방 (2026-11-10 요청: 담임 목사님·사모님이 보고서 외에 부서 안건을 직접 말하는 창구)
--   두 분이 부서(그룹)를 골라 안건을 올리면, 그 부서의 파트총괄·부장·팀장(memberships.role='reviewer')과
--   담당 교역자(교역자 계정 + 직책 '교역자'·'담당교역자')가 함께 보고 답글을 단다. 상위·하위 부서 소속도 포함한다
--   (교육부에 올리면 그 아래 파트의 총괄도, 파트에 올리면 교육부 총괄도 본다). 팀원·작성자·기능 관리자는 보지 않는다.
--   안건 상태(진행 중/완료)는 두 분만 바꾼다. 새 안건·답글은 알림함(inbox_notifications.agenda_id)으로 가고, 앱이 푸시를 보낸다.
--   알림 제목·내용에는 안건 본문을 넣지 않는다(부서 이름만). 글자 수 상한 없음(2026-11-10 결정), 빈 글만 막는다.
-- report 스키마만 쓴다. 여러 번 실행해도 안전하다. 앱보다 먼저 적용한다.
begin;

create table if not exists report.agenda_items(
 id uuid primary key default gen_random_uuid(),
 group_id uuid not null references report.groups(id) on delete cascade,
 author_id uuid not null references report.profiles(id),
 title text not null check(char_length(btrim(title)) between 1 and 150),
 body text not null check(char_length(btrim(body)) >= 1),
 status text not null default 'open' check(status in ('open','done')),
 done_at timestamptz,
 done_by uuid references report.profiles(id),
 created_at timestamptz not null default now(),
 last_activity_at timestamptz not null default now());
create index if not exists agenda_items_activity on report.agenda_items(last_activity_at desc);
create index if not exists agenda_items_group on report.agenda_items(group_id);

create table if not exists report.agenda_replies(
 id uuid primary key default gen_random_uuid(),
 agenda_id uuid not null references report.agenda_items(id) on delete cascade,
 author_id uuid not null references report.profiles(id),
 body text not null check(char_length(btrim(body)) >= 1),
 created_at timestamptz not null default now());
create index if not exists agenda_replies_item on report.agenda_replies(agenda_id, created_at);

-- 이 사람이 이 부서 안건을 보는가(두 분, 또는 위·아래 부서 포함 총괄·부장·팀장·담당 교역자)
create or replace function report.agenda_member(p_user uuid, gid uuid) returns boolean
language sql stable security definer set search_path='' as $$
 with recursive up(id, parent_id) as (
   select g.id, g.parent_id from report.groups g where g.id = gid
   union select g.id, g.parent_id from report.groups g join up on g.id = up.parent_id),
 down(id) as (
   select g.id from report.groups g where g.id = gid
   union select g.id from report.groups g join down d on g.parent_id = d.id)
 select exists(select 1 from report.profiles p where p.id = p_user and p.status = 'active' and (
   p.recipient_role is not null or exists(
     select 1 from report.memberships m
      where m.user_id = p.id
        and (m.group_id in (select id from up) or m.group_id in (select id from down))
        and (m.role = 'reviewer' or (p.is_minister and m.position in ('교역자', '담당교역자'))))));
$$;
revoke all on function report.agenda_member(uuid, uuid) from public, anon, authenticated;

create or replace function report.can_read_agenda_group(gid uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select report.is_active_user() and report.agenda_member(auth.uid(), gid);
$$;
create or replace function report.can_read_agenda(p_agenda uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select report.is_active_user() and exists(select 1 from report.agenda_items a where a.id = p_agenda and report.agenda_member(auth.uid(), a.group_id));
$$;
-- 메뉴에 「부서 안건」을 보일지: 두 분이거나, 어느 부서든 안건을 볼 자리에 있으면
create or replace function report.agenda_visible() returns boolean
language sql stable security definer set search_path='' as $$
 select report.is_active_user() and (report.is_senior() or exists(
   select 1 from report.memberships m join report.profiles p on p.id = m.user_id
    where m.user_id = auth.uid() and (m.role = 'reviewer' or (p.is_minister and m.position in ('교역자', '담당교역자')))));
$$;
revoke all on function report.can_read_agenda_group(uuid), report.can_read_agenda(uuid), report.agenda_visible() from public, anon;
grant execute on function report.can_read_agenda_group(uuid), report.can_read_agenda(uuid), report.agenda_visible() to authenticated;

alter table report.agenda_items enable row level security;
alter table report.agenda_replies enable row level security;
revoke all on report.agenda_items, report.agenda_replies from public, anon, authenticated;
grant select, delete on report.agenda_items to authenticated;
grant insert(group_id, author_id, title, body) on report.agenda_items to authenticated;
grant select, delete on report.agenda_replies to authenticated;
grant insert(agenda_id, author_id, body) on report.agenda_replies to authenticated;
grant all on report.agenda_items, report.agenda_replies to service_role;

drop policy if exists agenda_read on report.agenda_items;
create policy agenda_read on report.agenda_items for select to authenticated using(report.can_read_agenda_group(group_id));
drop policy if exists agenda_add on report.agenda_items;
create policy agenda_add on report.agenda_items for insert to authenticated with check(
 report.is_senior() and author_id = auth.uid() and exists(select 1 from report.groups g where g.id = group_id and g.is_active));
drop policy if exists agenda_remove on report.agenda_items;
create policy agenda_remove on report.agenda_items for delete to authenticated using(report.is_senior() and author_id = auth.uid());

drop policy if exists agenda_reply_read on report.agenda_replies;
create policy agenda_reply_read on report.agenda_replies for select to authenticated using(report.can_read_agenda(agenda_id));
drop policy if exists agenda_reply_add on report.agenda_replies;
create policy agenda_reply_add on report.agenda_replies for insert to authenticated with check(author_id = auth.uid() and report.can_read_agenda(agenda_id));
drop policy if exists agenda_reply_remove on report.agenda_replies;
create policy agenda_reply_remove on report.agenda_replies for delete to authenticated using(author_id = auth.uid() and report.can_read_agenda(agenda_id));

-- 진행 중 / 완료: 두 분만
create or replace function report.set_agenda_status(p_agenda uuid, p_done boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not report.is_senior() then raise exception '담임 목사님·사모님만 안건 상태를 바꿀 수 있습니다.'; end if;
 update report.agenda_items
    set status = case when p_done then 'done' else 'open' end,
        done_at = case when p_done then coalesce(done_at, now()) end,
        done_by = case when p_done then coalesce(done_by, auth.uid()) end
  where id = p_agenda;
 if not found then raise exception '안건을 찾지 못했습니다.'; end if;
end $$;
revoke all on function report.set_agenda_status(uuid, boolean) from public, anon;
grant execute on function report.set_agenda_status(uuid, boolean) to authenticated;

-- 알림함: 안건이 지워지면 알림도 함께 지운다
alter table report.inbox_notifications add column if not exists agenda_id uuid references report.agenda_items(id) on delete cascade;
create index if not exists inbox_agenda on report.inbox_notifications(agenda_id) where agenda_id is not null;

-- 새 안건: 그 부서 안건을 보는 모든 분(올린 분 제외)에게
create or replace function report.notify_agenda_item() returns trigger
language plpgsql security definer set search_path='' as $$
declare gname text;
begin
 select name into gname from report.groups where id = new.group_id;
 insert into report.inbox_notifications(user_id, title, body, url, agenda_id)
 select p.id, '새 부서 안건이 올라왔습니다', coalesce(gname, '부서') || ' · 열어서 내용을 확인해 주세요.', '/agenda/' || new.id, new.id
   from report.profiles p
  where p.status = 'active' and p.id <> new.author_id and report.agenda_member(p.id, new.group_id);
 return new;
end $$;
revoke all on function report.notify_agenda_item() from public, anon, authenticated;
drop trigger if exists agenda_item_inbox on report.agenda_items;
create trigger agenda_item_inbox after insert on report.agenda_items for each row execute function report.notify_agenda_item();

-- 새 답글: 두 분이 쓰면 그 부서 안건을 보는 모든 분에게, 다른 분이 쓰면 두 분과 앞서 답글을 단 분에게
create or replace function report.notify_agenda_reply() returns trigger
language plpgsql security definer set search_path='' as $$
declare a report.agenda_items; gname text; by_senior boolean;
begin
 select * into a from report.agenda_items where id = new.agenda_id;
 update report.agenda_items set last_activity_at = now() where id = new.agenda_id;
 select name into gname from report.groups where id = a.group_id;
 select p.recipient_role is not null into by_senior from report.profiles p where p.id = new.author_id;
 insert into report.inbox_notifications(user_id, title, body, url, agenda_id)
 select p.id, '부서 안건에 답글이 달렸습니다', coalesce(gname, '부서') || ' · 열어서 확인해 주세요.', '/agenda/' || a.id || '#reply-' || new.id, a.id
   from report.profiles p
  where p.status = 'active' and p.id <> new.author_id and report.agenda_member(p.id, a.group_id)
    and (coalesce(by_senior, false) or p.recipient_role is not null or p.id = a.author_id
         or exists(select 1 from report.agenda_replies r where r.agenda_id = a.id and r.author_id = p.id and r.id <> new.id));
 return new;
end $$;
revoke all on function report.notify_agenda_reply() from public, anon, authenticated;
drop trigger if exists agenda_reply_inbox on report.agenda_replies;
create trigger agenda_reply_inbox after insert on report.agenda_replies for each row execute function report.notify_agenda_reply();

commit;
