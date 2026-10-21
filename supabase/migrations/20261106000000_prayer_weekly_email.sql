alter table report.prayer_meeting_reports add column prayer_session text check(prayer_session in('morning','evening'));
create function report.validate_prayer_session() returns trigger language plpgsql set search_path='' as $$
begin
 if new.prayer_session is null then raise exception 'prayer session required'; end if;
 if (new.prayer_session='morning' and extract(dow from new.meeting_date) not in(1,2,4,5)) or (new.prayer_session='evening' and extract(dow from new.meeting_date) not in(1,2,3,4)) then raise exception 'prayer day mismatch'; end if;
 if length(btrim(new.attendee_names))=0 or length(btrim(new.prayer_topics))=0 then raise exception 'attendees and prayer topics required'; end if;
 return new; end $$;
create trigger prayer_session before insert on report.prayer_meeting_reports for each row execute function report.validate_prayer_session();
revoke all on function report.validate_prayer_session() from public,anon,authenticated;
create table report.prayer_meeting_comments(
 id uuid primary key default gen_random_uuid(),prayer_report_id uuid not null references report.prayer_meeting_reports(id) on delete cascade,
 author_id uuid not null references report.profiles(id),body text not null check(char_length(btrim(body)) between 1 and 1000),created_at timestamptz not null default now());
alter table report.prayer_meeting_comments enable row level security;
revoke all on report.prayer_meeting_comments from public,anon,authenticated;
grant select,insert,delete on report.prayer_meeting_comments to authenticated;
create policy prayer_comment_read on report.prayer_meeting_comments for select to authenticated using(report.is_clergy());
create policy prayer_comment_add on report.prayer_meeting_comments for insert to authenticated with check(report.is_clergy() and author_id=auth.uid());
create policy prayer_comment_delete on report.prayer_meeting_comments for delete to authenticated using(report.is_clergy() and (author_id=auth.uid() or report.is_senior()));
alter table report.inbox_notifications add column prayer_report_id uuid references report.prayer_meeting_reports(id) on delete cascade;
drop policy inbox_read on report.inbox_notifications;
create policy inbox_read on report.inbox_notifications for select to authenticated using(user_id=auth.uid() and report.is_active_user()
 and (url not like '/admin/%' or report.is_admin())
 and (notice_id is null or exists(select 1 from report.notices n where n.id=notice_id))
 and (report_id is null or report.can_view_report(report_id))
 and (incident_id is null or exists(select 1 from report.worship_incidents i where i.id=incident_id))
 and (minister_thread_id is null or report.can_read_minister_thread(minister_thread_id))
 and (prayer_report_id is null or report.is_clergy()));
create function report.notify_prayer_comment() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into report.inbox_notifications(user_id,title,body,url,prayer_report_id)
 select p.author_id,'기도제목에 코멘트가 등록되었습니다',left(new.body,160),'/prayer-meetings#prayer-'||p.id,p.id
 from report.prayer_meeting_reports p where p.id=new.prayer_report_id and p.author_id<>new.author_id;
 return new; end $$;
revoke all on function report.notify_prayer_comment() from public,anon,authenticated;
create trigger prayer_comment_inbox after insert on report.prayer_meeting_comments for each row execute function report.notify_prayer_comment();
create table report.weekly_email_deliveries(
 week date not null,recipient_id uuid not null references report.profiles(id),status text not null check(status in('sending','sent','failed')),
 claimed_at timestamptz not null default now(),sent_at timestamptz,primary key(week,recipient_id));
alter table report.weekly_email_deliveries enable row level security;
revoke all on report.weekly_email_deliveries from public,anon,authenticated;
grant all on report.weekly_email_deliveries to service_role;
create function report.claim_weekly_email(p_week date,p_recipient uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare claimed uuid; begin
 if extract(dow from p_week)<>0 or p_week>(now() at time zone 'Asia/Seoul')::date then raise exception 'invalid week'; end if;
 if not exists(select 1 from report.profiles where id=p_recipient and status='active' and recipient_role is not null and email is not null) then return false; end if;
 insert into report.weekly_email_deliveries(week,recipient_id,status) values(p_week,p_recipient,'sending')
 on conflict(week,recipient_id) do update set status='sending',claimed_at=now() where weekly_email_deliveries.status='failed' or (weekly_email_deliveries.status='sending' and weekly_email_deliveries.claimed_at<now()-interval '30 minutes')
 returning recipient_id into claimed;
 return claimed is not null;
end $$;
revoke all on function report.claim_weekly_email(date,uuid) from public,anon,authenticated;
grant execute on function report.claim_weekly_email(date,uuid) to service_role;
