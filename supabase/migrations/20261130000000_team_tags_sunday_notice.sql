-- 1) 보고서 팀 태그: 목사님·사모님·교역자가 제출된 보고서를 보고 다른 팀에 짧은 메모와 함께 공유한다.
--    태그된 팀원은 그 보고서를 볼 수 있고(보기만), 알림을 받는다. 작성자가 고르는 '함께 보는 부서'(report_mentions)와 따로 둬서
--    작성자가 보고서를 고쳐도 태그가 지워지지 않는다.
create table report.report_team_tags(
 report_id uuid not null references report.reports(id) on delete cascade,
 group_id uuid not null references report.groups(id) on delete cascade,
 memo text not null default '' check(char_length(memo)<=300),
 tagged_by uuid not null references report.profiles(id),
 created_at timestamptz not null default now(),
 primary key(report_id,group_id));
create index report_team_tags_group on report.report_team_tags(group_id);
alter table report.report_team_tags enable row level security;
revoke all on report.report_team_tags from public,anon,authenticated;
grant select on report.report_team_tags to authenticated;
create policy report_team_tags_read on report.report_team_tags for select to authenticated using(report.can_view_report(report_id));

-- 멘션받은 부서와 같은 방식으로, 태그된 팀원에게도 제출된 보고를 연다(can_view_report·reports_mention_read가 이 함수를 쓴다).
create or replace function report.is_mentioned_member(rid uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from report.report_mentions m where m.report_id=rid and report.group_role(m.group_id) is not null)
      or exists(select 1 from report.report_team_tags t where t.report_id=rid and report.group_role(t.group_id) is not null);
$$;

create function report.tag_report_teams(rid uuid, gids uuid[], note text) returns int
language plpgsql security definer set search_path='' as $$
declare r record; g record; who text; added int:=0; stamp text;
begin
 if not (report.is_active_user() and report.is_clergy()) then raise exception 'clergy required' using errcode='42501'; end if;
 select id,group_id,status,meeting_date,meeting_label,author_name into r from report.reports where id=rid;
 if r.id is null or r.status not in ('submitted','reviewed') or not report.can_view_report(rid) then raise exception 'report not taggable' using errcode='42501'; end if;
 if coalesce(array_length(gids,1),0) not between 1 and 10 then raise exception 'pick 1-10 teams' using errcode='22023'; end if;
 note=left(btrim(coalesce(note,'')),300);
 who=coalesce(report.comment_author_name(auth.uid()),'교역자');
 stamp=floor(extract(epoch from clock_timestamp()))::bigint::text;
 for g in select distinct gr.id,gr.name from report.groups gr where gr.id=any(gids) and gr.is_active and gr.id<>r.group_id
   and not exists(select 1 from report.groups c where c.parent_id=gr.id and c.is_active) loop
  insert into report.report_team_tags(report_id,group_id,memo,tagged_by) values(rid,g.id,note,auth.uid())
   on conflict(report_id,group_id) do update set memo=excluded.memo,tagged_by=excluded.tagged_by,created_at=now();
  added=added+1;
  -- report_event_key가 있으면 앱이 휴대폰 알림도 보낸다. 다시 태그하면(메모 수정 등) 다시 알린다.
  insert into report.inbox_notifications(user_id,title,body,url,report_id,report_event_key)
  select distinct on (m.user_id) m.user_id,who||'님이 '||g.name||'에 보고서를 공유했습니다',
   case when note<>'' then '“'||note||'” · ' else '' end||coalesce(r.author_name,'작성자')||' · '||r.meeting_date::text||' · '||coalesce(r.meeting_label,'예배·모임'),
   '/reports/'||rid,rid,rid::text||':tag:'||g.id::text||':'||m.user_id::text||':'||stamp
  from report.memberships m join report.profiles p on p.id=m.user_id and p.status='active'
  where m.group_id=g.id and m.user_id<>auth.uid()
  on conflict(report_event_key) where report_event_key is not null do nothing;
 end loop;
 return added;
end $$;
revoke all on function report.tag_report_teams(uuid,uuid[],text) from public,anon;
grant execute on function report.tag_report_teams(uuid,uuid[],text) to authenticated;

create function report.untag_report_team(rid uuid, gid uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not (report.is_active_user() and report.is_clergy()) then raise exception 'clergy required' using errcode='42501'; end if;
 delete from report.report_team_tags where report_id=rid and group_id=gid;
end $$;
revoke all on function report.untag_report_team(uuid,uuid) from public,anon;
grant execute on function report.untag_report_team(uuid,uuid) to authenticated;

-- 2) 이번 주(돌아오는 주일) 공지: 교역자·관리자가 쓰고, 승인된 모든 사용자가 첫 화면 팝업으로 본다. 주일마다 하나.
create table report.sunday_notices(
 sunday date primary key check(extract(dow from sunday)=0),
 body text not null check(char_length(btrim(body)) between 1 and 1000),
 author_id uuid not null references report.profiles(id),
 updated_by uuid not null references report.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now());
alter table report.sunday_notices enable row level security;
revoke all on report.sunday_notices from public,anon,authenticated;
grant select,insert,delete on report.sunday_notices to authenticated;
grant update(body) on report.sunday_notices to authenticated;
create policy sunday_notices_read on report.sunday_notices for select to authenticated using(report.is_active_user());
create policy sunday_notices_add on report.sunday_notices for insert to authenticated with check(report.is_active_user() and (report.is_clergy() or report.is_admin()));
create policy sunday_notices_change on report.sunday_notices for update to authenticated using(report.is_active_user() and (report.is_clergy() or report.is_admin())) with check(report.is_active_user() and (report.is_clergy() or report.is_admin()));
create policy sunday_notices_remove on report.sunday_notices for delete to authenticated using(report.is_active_user() and (report.is_clergy() or report.is_admin()));
create function report.stamp_sunday_notice() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='INSERT' then new.author_id=auth.uid(); new.created_at=clock_timestamp(); end if;
 new.updated_by=auth.uid(); new.updated_at=clock_timestamp(); return new;
end $$;
revoke all on function report.stamp_sunday_notice() from public,anon,authenticated;
create trigger sunday_notice_stamp before insert or update on report.sunday_notices for each row execute function report.stamp_sunday_notice();
