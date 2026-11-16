-- DB 59: 중등부 ↔ 고등부 보고 가져오기.
-- 이 보고를 고칠 수 있는 사람에게만, 같은 날
-- 상대 부서 보고의 설교 본문·설교자·설교 요약·
-- 공과·활동만 돌려준다(출결·기도제목 없음).
-- 제출본 중 최신, 없으면 내 임시저장.
create or replace function report.sibling_sermon(rid uuid)
returns table(
  from_group text, meeting_date date,
  sermon_passage text, preacher text,
  sermon_summary text, activity text)
language sql stable security definer
set search_path = '' as $$
  with me as (
    select r.meeting_date,
      case g.name when '중등부' then '고등부'
                  when '고등부' then '중등부' end
        as other
    from report.reports r
    join report.groups g on g.id = r.group_id
    where r.id = rid and g.type = 'education'
      and report.can_edit_report(rid)
  )
  select g.name, s.meeting_date,
    coalesce(s.details->>'sermon_passage', ''),
    coalesce(s.details->>'preacher', ''),
    coalesce(s.details->>'sermon_summary', ''),
    coalesce(s.details->>'activity', '')
  from me
  join report.groups g
    on g.name = me.other and g.is_active
   and g.type = 'education'
  join report.reports s
    on s.group_id = g.id
   and s.meeting_date = me.meeting_date
  where s.status <> 'draft'
     or s.author_id = auth.uid()
  order by (s.status <> 'draft') desc,
    s.submitted_at desc nulls last,
    s.updated_at desc
  limit 1;
$$;
revoke all on function report.sibling_sermon(uuid)
  from public, anon;
grant execute
  on function report.sibling_sermon(uuid)
  to authenticated;
