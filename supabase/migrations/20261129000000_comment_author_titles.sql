-- 피드백·댓글을 '코멘트'로 통일하고, 알림 제목에 누가 남겼는지 이름을 넣는다.
-- 예) '김○○님이 보고서에 코멘트를 남겼습니다', '김○○님이 내 코멘트에 답글을 남겼습니다'
-- 트리거는 그대로 두고 함수 본문만 바꾼다. 이미 보낸 알림 제목은 바꾸지 않는다(화면에서 표현만 맞춘다).
create or replace function report.comment_author_name(uid uuid) returns text
language sql stable security definer set search_path='' as $$
  select coalesce(nullif(btrim(real_name),''),'누군가') from report.profiles where id=uid;
$$;
revoke all on function report.comment_author_name(uuid) from public,anon,authenticated;

create or replace function report.notify_report_feedback() returns trigger language plpgsql security definer set search_path='' as $$
declare target_user uuid; target_id uuid; who text; begin
 if TG_TABLE_NAME='report_comment_replies' then select c.author_id,c.report_id into target_user,target_id from report.report_comments c where c.id=new.comment_id;
 else target_id=new.report_id; select author_id into target_user from report.reports where id=target_id; end if;
 who=coalesce(report.comment_author_name(new.author_id),'누군가');
 if target_user<>new.author_id then insert into report.inbox_notifications(user_id,title,body,url,report_id) values(target_user,
  case when TG_TABLE_NAME='report_comment_replies' then who||'님이 내 코멘트에 답글을 남겼습니다' else who||'님이 보고서에 코멘트를 남겼습니다' end,
  left(new.body,160),'/reports/'||target_id||'#comments',target_id); end if; return new; end $$;

create or replace function report.notify_incident_feedback() returns trigger language plpgsql security definer set search_path='' as $$
declare target_user uuid; target_id uuid; who text; begin
 if TG_TABLE_NAME='incident_comment_replies' then select c.author_id,c.incident_id into target_user,target_id from report.incident_comments c where c.id=new.comment_id;
 else target_id=new.incident_id; select author_id into target_user from report.worship_incidents where id=target_id; end if;
 who=coalesce(report.comment_author_name(new.author_id),'누군가');
 if target_user<>new.author_id then insert into report.inbox_notifications(user_id,title,body,url,incident_id) values(target_user,
  case when TG_TABLE_NAME='incident_comment_replies' then who||'님이 내 코멘트에 답글을 남겼습니다' else who||'님이 이슈에 코멘트를 남겼습니다' end,
  left(new.body,160),'/incidents/'||target_id||'#comments',target_id); end if; return new; end $$;

create or replace function report.notify_extra_comment_reply() returns trigger language plpgsql security definer set search_path='' as $$
declare target_user uuid; parent uuid; who text;
begin
 who=coalesce(report.comment_author_name(new.author_id),'누군가');
 if TG_TABLE_NAME='prayer_comment_replies' then
  select author_id,prayer_report_id into target_user,parent from report.prayer_meeting_comments where id=new.comment_id;
  if target_user<>new.author_id then insert into report.inbox_notifications(user_id,title,body,url,prayer_report_id) values(target_user,who||'님이 내 코멘트에 답글을 남겼습니다',left(new.body,160),'/prayer-meetings#prayer-'||parent,parent);end if;
 else
  select author_id,notice_id into target_user,parent from report.notice_comments where id=new.comment_id;
  if target_user<>new.author_id then insert into report.inbox_notifications(user_id,title,body,url,notice_id) values(target_user,who||'님이 내 코멘트에 답글을 남겼습니다',left(new.body,160),'/notices/'||parent||'#comments',parent);end if;
 end if;
 return new;
end $$;

create or replace function report.notify_prayer_comment() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into report.inbox_notifications(user_id,title,body,url,prayer_report_id)
 select p.author_id,coalesce(report.comment_author_name(new.author_id),'누군가')||'님이 기도제목에 코멘트를 남겼습니다',left(new.body,160),'/prayer-meetings#prayer-'||p.id,p.id
 from report.prayer_meeting_reports p where p.id=new.prayer_report_id and p.author_id<>new.author_id;
 return new; end $$;
