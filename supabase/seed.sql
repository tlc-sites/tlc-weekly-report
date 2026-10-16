-- 초기 데이터: 예배 목록, 분당 교육부서 8개·예배팀 10개, 부산 캠퍼스, 운영 설정
-- 여러 번 실행해도 중복되지 않도록 이름으로 존재 여부를 확인한다.

insert into report.service_types (name, weekday, sort_order)
select v.name, v.weekday, v.sort_order
from (values
  ('1부 예배', 0, 1),
  ('2부 예배', 0, 2),
  ('3부 예배', 0, 3),
  ('라이프라인 수요예배', 3, 4),
  ('라이프라인 금요예배', 5, 5)
) as v (name, weekday, sort_order)
where not exists (select 1 from report.service_types s where s.name = v.name);

-- 상위 그룹 (보고는 하위 그룹에서만 하므로 비정기)
insert into report.groups (type, name, schedule, sort_order)
select v.type::report.group_type, v.name, 'irregular', v.sort_order
from (values ('education', '교육부', 1), ('worship', '예배팀', 2)) as v (type, name, sort_order)
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
from (values ('음향', 1), ('영상', 2), ('조명', 3), ('자막', 4), ('음원', 5),
             ('웰컴', 6), ('성찬', 7), ('성찬준비', 8), ('새가족', 9), ('새가족케어', 10)) as v (name, sort_order)
cross join (select id from report.groups where name = '예배팀' and parent_id is null) p
where not exists (select 1 from report.groups g where g.name = v.name and g.parent_id = p.id);

insert into report.groups (type, name, schedule, sort_order)
select 'campus', '부산 캠퍼스', 'irregular', 3
where not exists (select 1 from report.groups where name = '부산 캠퍼스' and parent_id is null);

-- 예배팀 각 팀은 공통 예배 전체를 사용
insert into report.group_service_types (group_id, service_type_id)
select g.id, s.id
from report.groups g
join report.groups p on p.id = g.parent_id and p.name = '예배팀'
cross join report.service_types s
on conflict do nothing;

insert into report.app_settings (key, value) values
  ('deadline', '{"weekday": 1, "time": "23:59"}'),
  ('reminders', '{"first": "09:00", "second": "20:00", "meeting_digest": "08:00"}'),
  ('long_absence_threshold', '3')
on conflict (key) do nothing;
