-- PD 보고에 수요예배를 추가한다(기존 1~3부·라이프라인 연결은 그대로 둔다). 여러 번 실행해도 같은 결과다.
insert into report.group_service_types (group_id, service_type_id)
select g.id, s.id
from report.groups g
join report.groups p on p.id = g.parent_id and p.name = '예배/기술팀' and p.parent_id is null
join report.service_types s on s.name = '수요예배' and s.is_active
where g.name = 'PD'
on conflict do nothing;
