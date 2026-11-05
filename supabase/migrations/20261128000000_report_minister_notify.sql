-- 교역자 알림을 '교역자 전체'에서 '작성자가 고른 교역자'(details.notify_ministers)로 바꾼다.
-- details.notify='leadership'(담임목사님·사모님·교역자 전체)은 그대로 둔다. 예전 'clergy' 값도 계속 처리한다.
-- 고른 사람이 활성 교역자일 때만 보낸다(다른 계정 id를 넣어도 알림·열람이 생기지 않음). 열람 권한은 바꾸지 않는다.
create or replace function report.notify_report_leaders() returns trigger language plpgsql security definer set search_path='' as $$
declare target text; picked uuid[]; group_name text;
begin
 if new.status='draft' then return new; end if;
 target:=new.details->>'notify';
 if target is not null and target not in ('clergy','leadership') then target:=null; end if;
 select coalesce(array_agg(x.v::uuid),'{}') into picked from (
  select v from jsonb_array_elements_text(case when jsonb_typeof(new.details->'notify_ministers')='array' then new.details->'notify_ministers' else '[]'::jsonb end) e(v)
  where v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' limit 50) x;
 if target is null and cardinality(picked)=0 then return new; end if;
 select name into group_name from report.groups where id=new.group_id;
 insert into report.inbox_notifications(user_id,title,body,url,report_id,report_event_key)
 select p.id,case when target='leadership' then '리더십 전체에 공유된 보고가 있습니다' else '교역자에게 공유된 보고가 있습니다' end,
  coalesce(group_name,'다른 부서')||' · '||new.meeting_date::text||' · '||coalesce(new.meeting_label,'예배·모임')||' · '||coalesce(new.author_name,'작성자')||' 작성',
  '/reports/'||new.id,new.id,new.id::text||':leaders:'||p.id::text
 from report.profiles p
 where p.status='active' and p.id<>new.author_id and (
  (target='leadership' and (p.is_minister or p.recipient_role is not null))
  or (target='clergy' and p.is_minister and p.recipient_role is null)
  or (p.is_minister and p.id=any(picked)))
 on conflict(report_event_key) where report_event_key is not null do nothing;
 return new;
end $$;
revoke all on function report.notify_report_leaders() from public,anon,authenticated;
