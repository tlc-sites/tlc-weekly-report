-- 인물 사진은 작은 JPEG만 report 스키마에 저장해 기존 명단 RLS를 그대로 적용한다.
alter table report.members
  add column birth_date date check (birth_date between date '1900-01-01' and date '2100-12-31'),
  add column photo_data text check (photo_data is null or
    (length(photo_data) <= 200000 and photo_data ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+=*$'));

-- 매월 해당 요일의 몇 번째 모임인지. -1은 마지막 요일이다.
alter table report.service_types add column month_week smallint
  check (month_week in (-1, 1, 2, 3, 4, 5));

update report.service_types set name = '수요예배', weekday = 3, sort_order = 5 where name = '라이프라인 수요예배';
-- 기존 금요 보고는 기존 예배 이름으로 남긴다.
update report.service_types set is_active = false where name = '라이프라인 금요예배';
insert into report.service_types (name, weekday, month_week, sort_order)
select v.name, v.weekday, v.month_week, v.sort_order
from (values ('라이프라인', 0, null::smallint, 4), ('수요예배', 3, null::smallint, 5),
  ('어웨이크 AWAKE', 5, 1::smallint, 6), ('리바이브드 REVIVED', 5, 2::smallint, 7),
  ('인카운터 ENCOUNTER', 5, 3::smallint, 8), ('워십나잇 WORSHIP NIGHT', 5, -1::smallint, 9)) v(name,weekday,month_week,sort_order)
where not exists (select 1 from report.service_types s where s.name = v.name);
update report.service_types set weekday = 0 where name in ('1부 예배', '2부 예배', '3부 예배', '라이프라인');

-- 기존 상위 그룹 ID와 검토자 소속을 유지하면서 실제 예배팀을 별도 하위 그룹으로 만든다.
update report.groups set name = '예배/기술팀' where name = '예배팀' and parent_id is null and type = 'worship';
update report.groups g set name = v.new_name
from (values ('음향','음향팀'), ('영상','영상팀'), ('조명','조명팀'), ('자막','자막팀'),
  ('웰컴','웰컴팀'), ('성찬','성찬팀'), ('성찬준비','성찬준비팀'), ('새가족','새가족팀'), ('새가족케어','새가족케어팀')) v(old_name,new_name)
where g.name = v.old_name and g.type = 'worship'
  and g.parent_id = (select id from report.groups where name = '예배/기술팀' and parent_id is null and type = 'worship' limit 1)
  and not exists (select 1 from report.groups x where x.parent_id = g.parent_id and x.name = v.new_name);
update report.groups set is_active = false where name = '음원' and type = 'worship'
  and parent_id = (select id from report.groups where name = '예배/기술팀' and parent_id is null and type = 'worship' limit 1);
insert into report.groups(type,name,parent_id,schedule,sort_order)
select 'worship', '예배팀', p.id, 'weekly', 0 from report.groups p
where p.name = '예배/기술팀' and p.parent_id is null and p.type = 'worship'
  and not exists (select 1 from report.groups c where c.parent_id = p.id and c.name = '예배팀');
insert into report.group_service_types(group_id,service_type_id)
select g.id,s.id from report.groups g join report.groups p on p.id=g.parent_id
cross join report.service_types s
where p.name='예배/기술팀' and g.is_active and s.is_active
on conflict do nothing;

-- 삭제는 기록을 유지하는 보관 처리. 하위 그룹은 한 번에 숨기고 복원 시 각각 복원한다.
create function report.archive_group(p_group uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not report.is_admin() then raise exception '관리자만 그룹을 삭제할 수 있습니다'; end if;
  if not exists (select 1 from report.groups where id = p_group) then raise exception '그룹이 없습니다'; end if;
  update report.groups set is_active = false where id = p_group or parent_id = p_group;
end;
$$;
revoke all on function report.archive_group(uuid) from public, anon;
grant execute on function report.archive_group(uuid) to authenticated;

-- 별도 예배가 배정되지 않은 교육부서는 주일 출결로 바로 들어간다.
insert into report.group_meeting_types(group_id,name,weekday,sort_order)
select g.id,'주일예배',0,0 from report.groups g
where g.type='education' and g.is_active
  and not exists (select 1 from report.groups c where c.parent_id=g.id)
  and not exists (select 1 from report.group_service_types s where s.group_id=g.id)
  and not exists (select 1 from report.group_meeting_types m where m.group_id=g.id);
