create table report.inbox_notifications(id uuid primary key default gen_random_uuid(),user_id uuid not null references report.profiles(id) on delete cascade,title text not null,body text not null,url text not null check(url like '/%' and url not like '//%'),report_id uuid references report.reports(id) on delete cascade,incident_id uuid references report.worship_incidents(id) on delete cascade,notice_id uuid references report.notices(id) on delete cascade,read_at timestamptz,created_at timestamptz not null default now());
create index inbox_user_created on report.inbox_notifications(user_id,created_at desc);
alter table report.inbox_notifications enable row level security;
revoke all on report.inbox_notifications from public,anon,authenticated;
grant select on report.inbox_notifications to authenticated;
grant all on report.inbox_notifications to service_role;
create policy inbox_read on report.inbox_notifications for select to authenticated using(user_id=auth.uid() and report.is_active_user() and (url not like '/admin/%' or report.is_admin()) and (notice_id is null or exists(select 1 from report.notices n where n.id=notice_id)) and (report_id is null or report.can_view_report(report_id)) and (incident_id is null or exists(select 1 from report.worship_incidents i where i.id=incident_id)));
create function report.read_notification(p_id uuid) returns void language sql security definer set search_path='' as $$ update report.inbox_notifications set read_at=now() where id=p_id and user_id=auth.uid() and report.is_active_user(); $$;
revoke all on function report.read_notification(uuid) from public,anon;
grant execute on function report.read_notification(uuid) to authenticated;
create table report.report_comment_replies(id uuid primary key default gen_random_uuid(),comment_id uuid not null references report.report_comments(id) on delete cascade,author_id uuid not null references report.profiles(id),body text not null check(char_length(btrim(body)) between 1 and 1000),created_at timestamptz not null default now());
create index report_replies_parent on report.report_comment_replies(comment_id,created_at);
alter table report.report_comment_replies enable row level security;
revoke all on report.report_comment_replies from public,anon,authenticated;
grant select,insert,delete on report.report_comment_replies to authenticated;
create policy replies_read on report.report_comment_replies for select to authenticated using(report.is_active_user() and exists(select 1 from report.report_comments c where c.id=comment_id and report.can_view_report(c.report_id)));
create policy replies_add on report.report_comment_replies for insert to authenticated with check(author_id=auth.uid() and report.is_active_user() and exists(select 1 from report.report_comments c where c.id=comment_id and report.can_view_report(c.report_id)));
create policy replies_delete on report.report_comment_replies for delete to authenticated using(report.is_active_user() and (author_id=auth.uid() or report.is_senior()) and exists(select 1 from report.report_comments c where c.id=comment_id and report.can_view_report(c.report_id)));
create function report.notify_report_feedback() returns trigger language plpgsql security definer set search_path='' as $$
declare target_user uuid; target_id uuid; begin
 if TG_TABLE_NAME='report_comment_replies' then select c.author_id,c.report_id into target_user,target_id from report.report_comments c where c.id=new.comment_id;
 else target_id=new.report_id; select author_id into target_user from report.reports where id=target_id; end if;
 if target_user<>new.author_id then insert into report.inbox_notifications(user_id,title,body,url,report_id) values(target_user,case when TG_TABLE_NAME='report_comment_replies' then '피드백에 답글이 등록되었습니다' else '새 목회 피드백이 등록되었습니다' end,left(new.body,160),'/reports/'||target_id||'#comments',target_id); end if; return new; end $$;
revoke all on function report.notify_report_feedback() from public,anon,authenticated;
create trigger feedback_inbox after insert on report.report_comments for each row execute function report.notify_report_feedback();
create trigger reply_inbox after insert on report.report_comment_replies for each row execute function report.notify_report_feedback();
create table report.incident_comment_replies(id uuid primary key default gen_random_uuid(),comment_id uuid not null references report.incident_comments(id) on delete cascade,author_id uuid not null references report.profiles(id),body text not null check(char_length(btrim(body)) between 1 and 1000),created_at timestamptz not null default now());
create index incident_replies_parent on report.incident_comment_replies(comment_id,created_at);
alter table report.incident_comment_replies enable row level security;
revoke all on report.incident_comment_replies from public,anon,authenticated;
grant select,insert,delete on report.incident_comment_replies to authenticated;
create policy replies_read on report.incident_comment_replies for select to authenticated using(report.is_active_user() and exists(select 1 from report.incident_comments c where c.id=comment_id and exists(select 1 from report.worship_incidents i where i.id=c.incident_id)));
create policy replies_add on report.incident_comment_replies for insert to authenticated with check(author_id=auth.uid() and report.is_active_user() and exists(select 1 from report.incident_comments c where c.id=comment_id and exists(select 1 from report.worship_incidents i where i.id=c.incident_id)));
create policy replies_delete on report.incident_comment_replies for delete to authenticated using(report.is_active_user() and (author_id=auth.uid() or report.is_senior()) and exists(select 1 from report.incident_comments c where c.id=comment_id and exists(select 1 from report.worship_incidents i where i.id=c.incident_id)));
create function report.notify_incident_feedback() returns trigger language plpgsql security definer set search_path='' as $$
declare target_user uuid; target_id uuid; begin
 if TG_TABLE_NAME='incident_comment_replies' then select c.author_id,c.incident_id into target_user,target_id from report.incident_comments c where c.id=new.comment_id;
 else target_id=new.incident_id; select author_id into target_user from report.worship_incidents where id=target_id; end if;
 if target_user<>new.author_id then insert into report.inbox_notifications(user_id,title,body,url,incident_id) values(target_user,case when TG_TABLE_NAME='incident_comment_replies' then '피드백에 답글이 등록되었습니다' else '새 목회 피드백이 등록되었습니다' end,left(new.body,160),'/incidents/'||target_id||'#comments',target_id); end if; return new; end $$;
revoke all on function report.notify_incident_feedback() from public,anon,authenticated;
create trigger feedback_inbox after insert on report.incident_comments for each row execute function report.notify_incident_feedback();
create trigger reply_inbox after insert on report.incident_comment_replies for each row execute function report.notify_incident_feedback();
