-- 예배위원 보고 파트. 예배위원 명단은 기존 공유 worship_staff를 그대로 쓰고,
-- 이 파트의 보고서에는 예배위원 관련 사역 내용과 이슈를 적는다.
insert into report.groups (type, name, parent_id, schedule, sort_order)
select 'worship', '예배위원', p.id, 'weekly', 11
from report.groups p
where p.name = '예배/기술팀' and p.parent_id is null and p.type = 'worship'
  and not exists (select 1 from report.groups g where g.parent_id = p.id and g.name = '예배위원');

insert into report.group_service_types (group_id, service_type_id)
select g.id, s.id
from report.groups g
join report.groups p on p.id = g.parent_id and p.name = '예배/기술팀' and p.parent_id is null
cross join report.service_types s
where g.name = '예배위원' and s.is_active
on conflict do nothing;
