-- 팀의 간단 이슈와 상세 경위서를 같은 행에서 관리한다.
alter table report.worship_incidents
  add column category text not null default '기타' check (char_length(btrim(category)) between 1 and 30),
  add column detailed boolean not null default true;

-- 기존 팀 이슈는 원본 ID·상태·내용을 보존해 한 번만 이관한다.
alter table report.worship_incidents disable trigger validate_worship_incident;
insert into report.worship_incidents
 (id,author_id,report_id,group_ids,occurred_on,service_id,service_name,title,circumstances,response,status,created_at,category,detailed)
select i.id,r.author_id,r.id,array[r.group_id],r.meeting_date,r.service_type_id,
 coalesce(s.name,m.name,r.meeting_label,'예배'),left(i.content,100),i.content,coalesce(i.action,''),i.status::text,i.created_at,i.category,false
from report.report_issues i join report.reports r on r.id=i.report_id
join report.groups g on g.id=r.group_id and g.type='worship'
left join report.service_types s on s.id=r.service_type_id
left join report.group_meeting_types m on m.id=r.group_meeting_type_id
on conflict(id) do nothing;
alter table report.worship_incidents enable trigger validate_worship_incident;

-- 상세 경위서만 해결 시 개선대책을 필수로 한다. 상세→간단 변경으로 검증을 우회하지 못한다.
do $$
declare body text;
begin
 body=pg_get_functiondef('report.validate_worship_incident()'::regprocedure);
 body=replace(body,'if new.status=''resolved'' and','if new.detailed and new.status=''resolved'' and');
 body=replace(body,'if TG_OP=''UPDATE'' then',
   'if TG_OP=''UPDATE'' then
     if old.detailed and not new.detailed then raise exception ''상세 경위서는 간단 이슈로 되돌릴 수 없습니다''; end if;');
 execute body;
end;
$$;

-- 기존 표는 보관하되 팀 이슈의 두 번째 저장 경로가 되지 않게 막는다.
create function report.freeze_legacy_team_issue() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from report.reports r join report.groups g on g.id=r.group_id
    where r.id=case when TG_OP='DELETE' then old.report_id else new.report_id end and g.type='worship') then
   raise exception '팀 이슈는 통합된 팀 이슈 화면에서 관리해 주세요';
 end if;
 if TG_OP='DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function report.freeze_legacy_team_issue() from public,anon;
create trigger freeze_legacy_team_issue before insert or update or delete on report.report_issues
for each row execute function report.freeze_legacy_team_issue();

-- 예배팀의 저장 RPC는 기존 이슈 배열을 교체하지 않는다. 나머지 저장/권한 로직은 보존한다.
do $$
declare body text;
begin
 body=pg_get_functiondef('report.save_report(uuid,jsonb,report.report_status)'::regprocedure);
 if position('if p_payload ? ''issues'' then' in body)=0 then
   raise exception '보고 저장 함수의 예상 이슈 분기를 찾지 못했습니다';
 end if;
 body=replace(body,'if p_payload ? ''issues'' then','if p_payload ? ''issues'' and v_type <> ''worship'' then');
 execute body;
end;
$$;