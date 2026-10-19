-- 초기 데이터: 예배 목록, 분당 교육부서 8개·예배팀 10개, 부산 캠퍼스, 운영 설정
-- 여러 번 실행해도 중복되지 않도록 이름으로 존재 여부를 확인한다.

insert into report.service_types (name, weekday, sort_order)
select v.name, v.weekday, v.sort_order
from (values
  ('1부 예배', 0, 1),
  ('2부 예배', 0, 2),
  ('3부 예배', 0, 3),
  ('라이프라인', 0, 4),
  ('수요예배', 3, 5),
  ('어웨이크 AWAKE', 5, 6),
  ('리바이브드 REVIVED', 5, 7),
  ('인카운터 ENCOUNTER', 5, 8),
  ('워십나잇 WORSHIP NIGHT', 5, 9)
) as v (name, weekday, sort_order)
where not exists (select 1 from report.service_types s where s.name = v.name);

update report.service_types set month_week = case name
  when '어웨이크 AWAKE' then 1 when '리바이브드 REVIVED' then 2
  when '인카운터 ENCOUNTER' then 3 when '워십나잇 WORSHIP NIGHT' then -1 end
where name in ('어웨이크 AWAKE','리바이브드 REVIVED','인카운터 ENCOUNTER','워십나잇 WORSHIP NIGHT');

-- 상위 그룹 (보고는 하위 그룹에서만 하므로 비정기)
insert into report.groups (type, name, schedule, sort_order)
select v.type::report.group_type, v.name, 'irregular', v.sort_order
from (values ('education', '교육부', 1), ('worship', '예배/기술팀', 2)) as v (type, name, sort_order)
where not exists (select 1 from report.groups g where g.name = v.name and g.parent_id is null);

insert into report.groups (type, name, parent_id, schedule, settings, sort_order)
select 'education', v.name, p.id, 'weekly', v.settings::jsonb, v.sort_order
from (values
  ('영유아부', '{"guardian_check": true}', 1),
  ('유치부', '{}', 2),
  ('유년부', '{}', 3),
  ('초등부', '{}', 4),
  ('소년부', '{}', 5),
  ('영어예배', '{}', 6),
  ('중등부', '{}', 7),
  ('고등부', '{}', 8)
) as v (name, settings, sort_order)
cross join (select id from report.groups where name = '교육부' and parent_id is null) p
where not exists (select 1 from report.groups g where g.name = v.name and g.parent_id = p.id);

insert into report.groups (type, name, parent_id, schedule, sort_order)
select 'worship', v.name, p.id, 'weekly', v.sort_order
from (values ('예배팀', 0), ('음향팀', 1), ('영상팀', 2), ('조명팀', 3), ('자막팀', 4),
             ('웰컴팀', 6), ('성찬팀', 7), ('성찬준비팀', 8), ('새가족팀', 9), ('새가족케어팀', 10)) as v (name, sort_order)
cross join (select id from report.groups where name = '예배/기술팀' and parent_id is null) p
where not exists (select 1 from report.groups g where g.name = v.name and g.parent_id = p.id);

insert into report.groups (type, name, schedule, sort_order)
select 'campus', '부산 캠퍼스', 'irregular', 3
where not exists (select 1 from report.groups where name = '부산 캠퍼스' and parent_id is null);

-- 예배팀 각 팀은 공통 예배 전체를 사용
insert into report.group_service_types (group_id, service_type_id)
select g.id, s.id
from report.groups g
join report.groups p on p.id = g.parent_id and p.name = '예배/기술팀'
cross join report.service_types s
on conflict do nothing;

insert into report.app_settings (key, value) values
  ('deadline', '{"weekday": 1, "time": "23:59"}'),
  ('reminders', '{"first": "09:00", "second": "20:00", "meeting_digest": "08:00"}'),
  ('long_absence_threshold', '3')
on conflict (key) do nothing;

-- 별도 예배가 배정되지 않은 교육부서는 주일 출결로 바로 들어간다.
insert into report.group_meeting_types(group_id,name,weekday,sort_order)
select g.id,'주일예배',0,0 from report.groups g
where g.type='education' and g.is_active
  and not exists (select 1 from report.groups c where c.parent_id=g.id)
  and not exists (select 1 from report.group_service_types s where s.group_id=g.id)
  and not exists (select 1 from report.group_meeting_types m where m.group_id=g.id);

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

-- 기술팀은 필요할 때 보고하며 미제출 독촉은 하지 않는다.
update report.groups set schedule = 'irregular' where type = 'worship';
