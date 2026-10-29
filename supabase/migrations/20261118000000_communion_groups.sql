-- 성찬 파트 정리. 담당자 지정은 관리 화면에서 한다.
-- 운영처럼 성찬팀과 성찬준비팀이 이미 함께 운영 중이면: 성찬준비팀을 '성찬 준비팀'으로 쓰고
-- 성찬팀은 이름을 '성찬위원'으로 바꾼다 (새 파트를 만들지 않아 같은 일을 하는 파트가 겹치지 않는다).
-- 성찬팀만 있으면: 성찬팀을 '성찬 준비팀'으로 바꾸고 '성찬위원'을 새로 만든다.
do $$
declare
  v_parent uuid;
  v_team uuid;
  v_prep uuid;
  v_sort int;
begin
  select id into v_parent from report.groups
   where name = '예배/기술팀' and parent_id is null and type = 'worship' limit 1;
  if v_parent is null then return; end if;

  select id, sort_order into v_team, v_sort from report.groups
   where parent_id = v_parent and name = '성찬팀' limit 1;
  select id into v_prep from report.groups
   where parent_id = v_parent and is_active and replace(name, ' ', '') = '성찬준비팀' limit 1;
  if v_team is not null and v_prep is not null then
    if not exists (select 1 from report.groups where parent_id = v_parent and name = '성찬위원') then
      update report.groups set name = '성찬위원' where id = v_team;
    end if;
    update report.groups set name = '성찬 준비팀' where id = v_prep;
  elsif v_team is not null then
    update report.groups set name = '성찬 준비팀' where id = v_team;
  end if;

  if not exists (select 1 from report.groups where parent_id = v_parent and name = '성찬위원') then
    insert into report.groups (type, name, parent_id, schedule, sort_order)
    values ('worship', '성찬위원', v_parent, 'weekly', coalesce(v_sort, 7));
  end if;
end $$;

-- 성찬위원도 다른 예배팀처럼 운영 중인 예배를 고를 수 있게 한다.
insert into report.group_service_types (group_id, service_type_id)
select g.id, s.id
from report.groups g
join report.groups p on p.id = g.parent_id and p.name = '예배/기술팀' and p.parent_id is null
cross join report.service_types s
where g.name = '성찬위원' and s.is_active
on conflict do nothing;
