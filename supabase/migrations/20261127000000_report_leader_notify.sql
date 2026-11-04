-- 보고 작성자가 details.notify로 교역자 전체('clergy') 또는 리더십 전체('leadership': 담임목사님·사모님·교역자)에 알린다.
-- 이분들은 이미 제출된 보고를 모두 읽을 수 있으므로(can_view_report의 is_clergy 조건) 열람 권한은 바꾸지 않고 알림만 만든다.
-- 알림은 사람마다 보고당 한 번만 간다(report_event_key). 교역자→리더십으로 넓히면 목사님·사모님만 새로 받는다.
create function report.notify_report_leaders() returns trigger language plpgsql security definer set search_path='' as $$
declare target text; group_name text;
begin
 if new.status='draft' then return new; end if;
 target:=new.details->>'notify';
 if target is null or target not in ('clergy','leadership') then return new; end if;
 select name into group_name from report.groups where id=new.group_id;
 insert into report.inbox_notifications(user_id,title,body,url,report_id,report_event_key)
 select p.id,case when target='clergy' then '교역자에게 공유된 보고가 있습니다' else '리더십 전체에 공유된 보고가 있습니다' end,
  coalesce(group_name,'다른 부서')||' · '||new.meeting_date::text||' · '||coalesce(new.meeting_label,'예배·모임')||' · '||coalesce(new.author_name,'작성자')||' 작성',
  '/reports/'||new.id,new.id,new.id::text||':leaders:'||p.id::text
 from report.profiles p
 where p.status='active' and p.id<>new.author_id
  and (case when target='clergy' then p.is_minister and p.recipient_role is null else p.is_minister or p.recipient_role is not null end)
 on conflict(report_event_key) where report_event_key is not null do nothing;
 return new;
end $$;
revoke all on function report.notify_report_leaders() from public,anon,authenticated;
create trigger report_leaders_notify after insert or update of details,status on report.reports
 for each row execute function report.notify_report_leaders();
