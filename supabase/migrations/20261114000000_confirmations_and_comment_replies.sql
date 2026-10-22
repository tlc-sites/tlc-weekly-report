-- 자동 열람과 직접 확인을 별도 보존한다.
create table report.senior_report_confirmations(
 report_id uuid not null references report.reports(id) on delete cascade,
 recipient_role text not null check(recipient_role in('pastor','pastor_wife')),
 viewer_id uuid not null references report.profiles(id),report_version timestamptz not null,
 confirmed_at timestamptz not null default clock_timestamp(),primary key(report_id,recipient_role));
alter table report.senior_report_confirmations enable row level security;
revoke all on report.senior_report_confirmations from public,anon,authenticated;
grant select on report.senior_report_confirmations to authenticated;
create policy confirmations_read on report.senior_report_confirmations for select to authenticated using(report.can_view_report(report_id));
create function report.confirm_senior_report(p_report uuid,p_version timestamptz) returns timestamptz
language plpgsql security definer set search_path='' as $$
declare senior_role text; result timestamptz;
begin
 perform report.mark_senior_report_read(p_report,p_version);
 select recipient_role into senior_role from report.profiles where id=auth.uid();
 insert into report.senior_report_confirmations(report_id,recipient_role,viewer_id,report_version)
 values(p_report,senior_role,auth.uid(),p_version)
 on conflict(report_id,recipient_role) do update set viewer_id=excluded.viewer_id,report_version=excluded.report_version,confirmed_at=clock_timestamp()
 where senior_report_confirmations.report_version is distinct from excluded.report_version or senior_report_confirmations.viewer_id is distinct from excluded.viewer_id;
 select confirmed_at into result from report.senior_report_confirmations where report_id=p_report and recipient_role=senior_role;
 return result;
end $$;
revoke all on function report.confirm_senior_report(uuid,timestamptz) from public,anon;
grant execute on function report.confirm_senior_report(uuid,timestamptz) to authenticated;

create table report.prayer_comment_replies(id uuid primary key default gen_random_uuid(),comment_id uuid not null references report.prayer_meeting_comments(id) on delete cascade,author_id uuid not null references report.profiles(id),body text not null check(char_length(btrim(body)) between 1 and 1000),created_at timestamptz not null default now());
create table report.notice_comment_replies(id uuid primary key default gen_random_uuid(),comment_id uuid not null references report.notice_comments(id) on delete cascade,author_id uuid not null references report.profiles(id),body text not null check(char_length(btrim(body)) between 1 and 1000),created_at timestamptz not null default now());
alter table report.prayer_comment_replies enable row level security;
alter table report.notice_comment_replies enable row level security;
revoke all on report.prayer_comment_replies,report.notice_comment_replies from public,anon,authenticated;
grant select,insert on report.prayer_comment_replies,report.notice_comment_replies to authenticated;
create index prayer_replies_parent on report.prayer_comment_replies(comment_id,created_at);
create index notice_replies_parent on report.notice_comment_replies(comment_id,created_at);
create policy prayer_replies_read on report.prayer_comment_replies for select to authenticated using(report.is_clergy());
create policy prayer_replies_add on report.prayer_comment_replies for insert to authenticated with check(report.is_clergy() and author_id=auth.uid() and exists(select 1 from report.prayer_meeting_comments c where c.id=comment_id));
create policy notice_replies_read on report.notice_comment_replies for select to authenticated using(report.is_active_user() and exists(select 1 from report.notice_comments c where c.id=comment_id and report.can_read_notice(c.notice_id)));
create policy notice_replies_add on report.notice_comment_replies for insert to authenticated with check(author_id=auth.uid() and report.is_active_user() and exists(select 1 from report.notice_comments c where c.id=comment_id and report.can_read_notice(c.notice_id)));
create function report.notify_extra_comment_reply() returns trigger language plpgsql security definer set search_path='' as $$
declare target_user uuid; parent uuid;
begin
 if TG_TABLE_NAME='prayer_comment_replies' then
  select author_id,prayer_report_id into target_user,parent from report.prayer_meeting_comments where id=new.comment_id;
  if target_user<>new.author_id then insert into report.inbox_notifications(user_id,title,body,url,prayer_report_id) values(target_user,'코멘트에 답글이 등록되었습니다',left(new.body,160),'/prayer-meetings#prayer-'||parent,parent);end if;
 else
  select author_id,notice_id into target_user,parent from report.notice_comments where id=new.comment_id;
  if target_user<>new.author_id then insert into report.inbox_notifications(user_id,title,body,url,notice_id) values(target_user,'댓글에 답글이 등록되었습니다',left(new.body,160),'/notices/'||parent||'#comments',parent);end if;
 end if;
 return new;
end $$;
revoke all on function report.notify_extra_comment_reply() from public,anon,authenticated;
create trigger prayer_reply_inbox after insert on report.prayer_comment_replies for each row execute function report.notify_extra_comment_reply();
create trigger notice_reply_inbox after insert on report.notice_comment_replies for each row execute function report.notify_extra_comment_reply();
-- 이전 마이그레이션은 유지하고 이후 발송되는 알림의 표현만 바꾼다.
do $$ declare signature text;begin
 foreach signature in array array['report.notify_report_feedback()','report.notify_incident_feedback()'] loop
 execute replace(pg_get_functiondef(signature::regprocedure),'새 목회 피드백이 등록되었습니다','새 피드백이 등록되었습니다');
 end loop;
end $$;
