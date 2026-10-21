-- 교역자 공동 기도회 보고와 최상단-담당교역자 비공개 대화.
create table report.prayer_meeting_reports(
 id uuid primary key default gen_random_uuid(), author_id uuid not null references report.profiles(id),
 author_name text not null check(char_length(btrim(author_name)) between 1 and 100),
 meeting_date date not null check(meeting_date <= (now() at time zone 'Asia/Seoul')::date),
 title text not null check(char_length(btrim(title)) between 1 and 150),
 scripture text not null default '', content text not null check(char_length(btrim(content)) between 1 and 5000),
 prayer_topics text not null default '' check(char_length(prayer_topics)<=5000),
 notes text not null default '' check(char_length(notes)<=3000),
 created_at timestamptz not null default now());
alter table report.prayer_meeting_reports enable row level security;
revoke all on report.prayer_meeting_reports from public,anon,authenticated;
grant select,insert on report.prayer_meeting_reports to authenticated;
create policy prayer_read on report.prayer_meeting_reports for select to authenticated using(report.is_clergy());
create policy prayer_add on report.prayer_meeting_reports for insert to authenticated with check(report.is_clergy() and author_id=auth.uid());
create table report.minister_threads(
 id uuid primary key default gen_random_uuid(), sender_id uuid not null references report.profiles(id),
 recipient_id uuid not null references report.profiles(id), subject text not null check(char_length(btrim(subject)) between 1 and 150),
 created_at timestamptz not null default now(), check(sender_id<>recipient_id));
create function report.can_read_minister_thread(p_thread uuid) returns boolean language sql stable security definer set search_path='' as $$
 select report.is_active_user() and exists(select 1 from report.minister_threads t where t.id=p_thread and (report.is_senior() or t.recipient_id=auth.uid() and report.is_clergy()));
$$;
revoke all on function report.can_read_minister_thread(uuid) from public,anon;
grant execute on function report.can_read_minister_thread(uuid) to authenticated;
alter table report.minister_threads enable row level security;
revoke all on report.minister_threads from public,anon,authenticated;
grant select,insert on report.minister_threads to authenticated;
create policy thread_read on report.minister_threads for select to authenticated using(report.is_senior() or recipient_id=auth.uid() and report.is_clergy());
create policy thread_add on report.minister_threads for insert to authenticated with check(report.is_senior() and sender_id=auth.uid() and exists(select 1 from report.profiles p where p.id=recipient_id and p.status='active' and p.is_minister));
create table report.minister_messages(
 id uuid primary key default gen_random_uuid(),thread_id uuid not null references report.minister_threads(id) on delete cascade,
 author_id uuid not null references report.profiles(id),body text not null check(char_length(btrim(body)) between 1 and 5000),
 created_at timestamptz not null default now());
create index minister_messages_thread on report.minister_messages(thread_id,created_at);
alter table report.minister_messages enable row level security;
revoke all on report.minister_messages from public,anon,authenticated;
grant select,insert on report.minister_messages to authenticated;
create policy message_read on report.minister_messages for select to authenticated using(report.can_read_minister_thread(thread_id));
create policy message_add on report.minister_messages for insert to authenticated with check(author_id=auth.uid() and report.can_read_minister_thread(thread_id));
create function report.start_minister_thread(p_recipient uuid,p_subject text,p_body text) returns uuid language plpgsql security invoker set search_path='' as $$
declare tid uuid; begin
 insert into report.minister_threads(sender_id,recipient_id,subject) values(auth.uid(),p_recipient,p_subject) returning id into tid;
 insert into report.minister_messages(thread_id,author_id,body) values(tid,auth.uid(),p_body);
 return tid; end $$;
revoke all on function report.start_minister_thread(uuid,text,text) from public,anon;
grant execute on function report.start_minister_thread(uuid,text,text) to authenticated;
alter table report.inbox_notifications add column minister_thread_id uuid references report.minister_threads(id) on delete cascade;
drop policy inbox_read on report.inbox_notifications;
create policy inbox_read on report.inbox_notifications for select to authenticated using(user_id=auth.uid() and report.is_active_user()
 and (url not like '/admin/%' or report.is_admin())
 and (notice_id is null or exists(select 1 from report.notices n where n.id=notice_id))
 and (report_id is null or report.can_view_report(report_id))
 and (incident_id is null or exists(select 1 from report.worship_incidents i where i.id=incident_id))
 and (minister_thread_id is null or report.can_read_minister_thread(minister_thread_id)));
create function report.notify_minister_message() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into report.inbox_notifications(user_id,title,body,url,minister_thread_id)
 select p.id,'새 비공개 메시지가 도착했습니다','메시지함에서 내용을 확인해 주세요.','/messages/'||new.thread_id,new.thread_id
 from report.profiles p join report.minister_threads t on t.id=new.thread_id
 where p.status='active' and p.id<>new.author_id and (p.recipient_role is not null or p.id=t.recipient_id and p.is_minister);
 return new; end $$;
revoke all on function report.notify_minister_message() from public,anon,authenticated;
create trigger minister_message_inbox after insert on report.minister_messages for each row execute function report.notify_minister_message();

