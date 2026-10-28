-- 성찬팀은 이름만 '성찬 준비팀'으로 바꿔 기존 보고·명단·담당자 기록을 그대로 잇고,
-- '성찬위원' 보고 파트를 새로 만든다. 담당자 지정은 관리 화면에서 한다.
do $$
declare
  v_parent uuid;
  v_team uuid;
  v_sort int;
begin
  select id into v_parent from report.groups
   where name = '예배/기술팀' and parent_id is null and type = 'worship' limit 1;
  if v_parent is null then return; end if;

  select id, sort_order into v_team, v_sort from report.groups
   where parent_id = v_parent and name = '성찬팀' limit 1;
  if v_team is not null then
    -- 이미 운영 중인 성찬준비팀이 있으면 같은 이름 파트가 둘이 되므로 멈추고 확인받는다.
    if exists (select 1 from report.groups where parent_id = v_parent and is_active
                 and replace(name, ' ', '') = '성찬준비팀' and id <> v_team) then
      raise exception 'communion: active 성찬준비팀 already exists';
    end if;
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
