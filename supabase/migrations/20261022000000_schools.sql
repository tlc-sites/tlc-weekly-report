-- 학교는 출결 없는 예배·교육 보고를 사용한다. 기존 명단·예배팀 구조는 유지한다.
insert into report.groups(type, name, schedule, sort_order)
select 'other', v.name, 'weekly', v.sort_order
from (values ('베리타스 기독초', 1), ('베리타스 기독국제중', 2)) v(name, sort_order)
where not exists (select 1 from report.groups g where g.name = v.name and g.type = 'other' and g.parent_id is null);

-- 학교 예배 요일은 정해지지 않았으므로 보고 시 날짜를 직접 선택한다.
insert into report.group_meeting_types(group_id, name, weekday, sort_order)
select g.id, '학교예배', null, 0 from report.groups g
where g.type = 'other' and g.parent_id is null and g.name in ('베리타스 기독초', '베리타스 기독국제중')
  and not exists (select 1 from report.group_meeting_types m where m.group_id = g.id and m.name = '학교예배');
