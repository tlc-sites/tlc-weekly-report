-- 종 알림은 푸시 구독/허용 여부와 무관하게 저장한다. 본문·기도·비공개 글은 넣지 않는다.
alter table report.inbox_notifications add column report_event_key text;
create unique index inbox_report_event_unique on report.inbox_notifications(report_event_key) where report_event_key is not null;
create function report.notify_report_lifecycle() returns trigger language plpgsql security definer set search_path='' as $$
declare event_kind text; actor uuid:=auth.uid(); group_name text; editor_name text;
begin
 if actor is null or not report.is_active_user() or new.status='draft' then return new; end if;
 if TG_OP='INSERT' then
  if new.status<>'submitted' then return new; end if;
  event_kind='submitted';
 elsif old.status='draft' and new.status='submitted' then event_kind='submitted';
 elsif report.is_clergy() and actor<>new.author_id and new.status in('submitted','reviewed') and
  ((new.details-'_report_meta') is distinct from (old.details-'_report_meta') or new.duty_part is distinct from old.duty_part
   or new.attend_snapshot is distinct from old.attend_snapshot or new.enrolled_snapshot is distinct from old.enrolled_snapshot
   or (old.status=new.status and old.status='submitted')) then event_kind='edited';
 else return new; end if;
 select name into group_name from report.groups where id=new.group_id;
 select real_name into editor_name from report.profiles where id=actor;
 insert into report.inbox_notifications(user_id,title,body,url,report_id,report_event_key)
 with recursive ancestors as(
  select id,parent_id from report.groups where id=new.group_id
  union all select g.id,g.parent_id from report.groups g join ancestors a on a.parent_id=g.id
 )
 select p.id,case when event_kind='submitted' then '새 보고서가 제출되었습니다' else '교역자가 보고서를 수정했습니다' end,
  coalesce(group_name,'담당 파트')||' · '||new.meeting_date::text||' · '||coalesce(new.meeting_label,'예배·모임')||' · '||
  case when event_kind='submitted' then new.author_name||' 작성' else coalesce(editor_name,'교역자')||' 수정' end,
  '/reports/'||new.id,new.id,new.id::text||':'||txid_current()::text||':'||p.id::text
 from report.profiles p where p.status='active' and p.id<>actor and (
  p.recipient_role is not null
  or (p.is_minister and exists(select 1 from report.memberships m join ancestors a on a.id=m.group_id where m.user_id=p.id))
  or (event_kind='edited' and p.id=new.author_id))
 on conflict(report_event_key) where report_event_key is not null do nothing;
 return new;
end $$;
revoke all on function report.notify_report_lifecycle() from public,anon,authenticated;
create trigger report_lifecycle_inbox after insert or update on report.reports for each row execute function report.notify_report_lifecycle();
