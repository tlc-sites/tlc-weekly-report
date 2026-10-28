-- ───── PD 보고 파트: 1~3부 예배와 라이프라인을 맡는다 ─────
insert into report.groups (type, name, parent_id, schedule, sort_order)
select 'worship', 'PD', p.id, 'weekly', 12
from report.groups p
where p.name = '예배/기술팀' and p.parent_id is null and p.type = 'worship'
  and not exists (select 1 from report.groups g where g.parent_id = p.id and g.name = 'PD');
insert into report.group_service_types (group_id, service_type_id)
select g.id, s.id
from report.groups g
join report.groups p on p.id = g.parent_id and p.name = '예배/기술팀' and p.parent_id is null
join report.service_types s on s.name in ('1부 예배', '2부 예배', '3부 예배', '라이프라인') and s.is_active
where g.name = 'PD'
on conflict do nothing;

-- ───── 직책: PD, 기타 교역자 ─────
-- 기타 교역자는 교역자 계정만 고를 수 있지만 작성 권한만 가진다(검토·담당 교역자 권한 아님).
create or replace function report.positions_for_group(gid uuid) returns table(title text,member_role report.member_role,is_clergy boolean)
language sql stable security definer set search_path='' as $$
  select t.title,(case when t.title in ('교역자','담당교역자','총괄','예배총괄','팀장','부팀장') then 'reviewer' else 'writer' end)::report.member_role,
    t.title in ('교역자','담당교역자','기타 교역자')
  from report.groups g cross join lateral unnest(case
    when g.type='education' then array['교역자','총괄','기타 교역자']
    when g.type='other' and coalesce(g.settings->>'report_category','')<>'internship' then array['총괄','담임','파트','기타 교역자']
    when g.name='예배팀' then array['담당교역자','예배인도자','기타 교역자']
    when g.name in ('음향팀','조명팀','자막팀') then array['담당교역자','오퍼레이터','기타 교역자']
    when g.name='영상팀' then array['담당교역자','예배총괄','팀장','부팀장','기타 교역자']
    when g.name='PD' then array['담당교역자','PD','기타 교역자']
    else array['담당교역자','기타 교역자'] end) t(title) where g.id=gid;
$$;

create or replace function report.set_memberships_with_minister(p_user uuid,p_assignments jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not report.is_admin() then raise exception 'forbidden' using errcode='42501'; end if;
 if p_user=auth.uid() and not report.is_senior() then raise exception 'cannot change own content assignments' using errcode='42501'; end if;
 if p_assignments is null or jsonb_typeof(p_assignments)<>'array' then raise exception 'assignments must be an array'; end if;
 perform 1 from report.profiles where id=p_user and status='active' for update;
 if not found then raise exception 'active user required'; end if;
 if exists(select 1 from jsonb_array_elements(p_assignments) x where x->>'position' in('교역자','담당교역자','기타 교역자'))
 and exists(select 1 from report.profiles where id=p_user and not is_minister and recipient_role is null) then
  perform report.set_minister(p_user,true);
 end if;
 perform report.set_memberships(p_user,p_assignments);
end $$;

-- 기타 교역자가 쓴 보고는 교역자 층(3)으로 둔다. 작성자 층으로 두면 모든 팀 작성자에게 열린다.
create or replace function report.group_content_layer(p_user uuid,gid uuid) returns integer
language sql stable security definer set search_path='' as $$
  with recursive chain(id,parent_id) as (
    select id,parent_id from report.groups where id=gid union
    select g.id,g.parent_id from report.groups g join chain c on g.id=c.parent_id
  ) select coalesce((select case when p.recipient_role is not null then 4 else coalesce((
    select max(case when (p.is_minister and (m.position in ('교역자','담당교역자','기타 교역자') or (m.position is null and m.role='reviewer'))) then 3
      when m.role='reviewer' then 2 else 1 end)
    from report.memberships m join chain c on c.id=m.group_id where m.user_id=p.id),0) end
    from report.profiles p where p.id=p_user and p.status='active'),0);
$$;

-- ───── 다른 부서 멘션 ─────
-- 작성자가 details.mentions에 부서를 고르면 제출 시 이 표로 옮기고, 그 부서 팀원이 보고를 읽고 알림을 받는다.
create table report.report_mentions(
 report_id uuid not null references report.reports(id) on delete cascade,
 group_id uuid not null references report.groups(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(report_id,group_id));
create index report_mentions_group on report.report_mentions(group_id);
alter table report.report_mentions enable row level security;
revoke all on report.report_mentions from public,anon,authenticated;
grant select on report.report_mentions to authenticated;

create function report.is_mentioned_member(rid uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from report.report_mentions m where m.report_id=rid and report.group_role(m.group_id) is not null);
$$;
revoke all on function report.is_mentioned_member(uuid) from public,anon;
grant execute on function report.is_mentioned_member(uuid) to authenticated;

create policy report_mentions_read on report.report_mentions for select to authenticated using(report.can_view_report(report_id));
-- 기존 열람 정책은 그대로 두고, 멘션받은 부서 팀원에게 제출된 보고만 추가로 연다.
create policy reports_mention_read on report.reports for select to authenticated
 using(report.is_active_user() and status in ('submitted','reviewed') and report.is_mentioned_member(id));

create or replace function report.can_view_report(rid uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select report.is_active_user() and exists(select 1 from report.reports r where r.id=rid and (
  report.is_senior() or report.has_setup_access() or (report.is_admin() and r.author_id=auth.uid())
  or (report.is_clergy() and r.status in ('submitted','reviewed'))
  or report.same_content_layer(r.author_layer) or report.group_role(r.group_id)='reviewer'
  or report.assigned_clergy(r.group_id) or (r.author_id=auth.uid() and report.group_role(r.group_id) is not null)
  or report.has_report_share(rid)
  or (r.status in ('submitted','reviewed') and report.is_mentioned_member(rid))));
$$;

create function report.sync_report_mentions() returns trigger language plpgsql security definer set search_path='' as $$
declare wanted uuid[]; group_name text;
begin
 if new.status='draft' then return new; end if;
 select coalesce(array_agg(id),'{}') into wanted from (
  select distinct g.id from jsonb_array_elements_text(case when jsonb_typeof(new.details->'mentions')='array' then new.details->'mentions' else '[]'::jsonb end) x(v)
  join report.groups g on g.id::text=x.v and g.is_active and g.id<>new.group_id
  where not exists(select 1 from report.groups c where c.parent_id=g.id and c.is_active)
  limit 5) chosen;
 delete from report.report_mentions where report_id=new.id and not (group_id=any(wanted));
 select name into group_name from report.groups where id=new.group_id;
 with added as (
  insert into report.report_mentions(report_id,group_id) select new.id,unnest(wanted) on conflict do nothing returning group_id
 )
 insert into report.inbox_notifications(user_id,title,body,url,report_id,report_event_key)
 select distinct on (m.user_id) m.user_id,'다른 부서에서 함께 봐 달라고 요청했습니다',
  coalesce(group_name,'다른 부서')||' · '||new.meeting_date::text||' · '||coalesce(new.meeting_label,'예배·모임')||' · '||coalesce(new.author_name,'작성자')||' 작성',
  '/reports/'||new.id,new.id,new.id::text||':mention:'||m.user_id::text
 from added a join report.memberships m on m.group_id=a.group_id
 join report.profiles p on p.id=m.user_id and p.status='active'
 where m.user_id<>new.author_id
 on conflict(report_event_key) where report_event_key is not null do nothing;
 return new;
end $$;
revoke all on function report.sync_report_mentions() from public,anon,authenticated;
create trigger report_mentions_sync after insert or update of details,status on report.reports
 for each row execute function report.sync_report_mentions();
