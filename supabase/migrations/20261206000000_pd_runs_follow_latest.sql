-- DB 46: 오늘(한국 시간)과 앞으로의 회차는 늘 그 예배의 최신 템플릿을 따른다. 지난 회차만 기록할 때의 버전으로 남긴다.
-- (그동안은 회차를 처음 만든 버전에 고정되어, 이번 주 회차를 먼저 열어 두면 나중에 고친 템플릿·송리스트 칸이 보이지 않았다.)
-- 버전을 올릴 때 새 템플릿에만 있는 조건은 기본값으로 채우고, 이미 정한 조건·체크·담당자 값은 그대로 둔다(같은 ID면 이어진다).
-- 함께: PD 체크리스트 담당자 칸에서 '담당 교역자'(r5)·'성찬 담당 (1주차)'(r6)를 뺀다(성찬 담당은 큐시트의 성찬 줄에서 계속 쓴다).
-- 앞으로 마이그레이션으로 템플릿 버전을 더하면 끝에 report.pd_runs_follow_latest(서비스)를 불러 준다.

create function report.pd_runs_follow_latest(p_service text) returns void
language plpgsql security definer set search_path='' as $$
declare v int; tpl jsonb;
begin
 select t.version,t.content into v,tpl from report.pd_templates t where t.service_key=p_service order by t.version desc limit 1;
 if v is null then return; end if;
 update report.pd_runs set template_version=v,conditions=report.pd_default_conditions(tpl,run_date)||conditions
 where service_key=p_service and template_version<v and run_date>=(now() at time zone 'Asia/Seoul')::date;
end $$;
revoke all on function report.pd_runs_follow_latest(text) from public,anon,authenticated;

create or replace function report.pd_run_save(p_service text, p_date date, p_patch jsonb) returns report.pd_runs
language plpgsql security definer set search_path='' as $$
declare v int; tpl jsonb; part text; k text; val jsonb; r report.pd_runs;
begin
 if not report.is_active_user() then raise exception 'active user required' using errcode='42501'; end if;
 if jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'bad patch' using errcode='22023'; end if;
 for part,val in select * from jsonb_each(p_patch) loop
  if part='pd' then
   if jsonb_typeof(val)<>'string' or char_length(val#>>'{}')>40 then raise exception 'bad pd' using errcode='22023'; end if;
  elsif part in ('conditions','checks','roster','report') then
   if jsonb_typeof(val)<>'object' or (select count(*) from jsonb_object_keys(val))>300 then raise exception 'bad %',part using errcode='22023'; end if;
   for k in select jsonb_object_keys(val) loop
    if k !~ '^[A-Za-z0-9_]{1,40}$' then raise exception 'bad key' using errcode='22023'; end if;
    if part in ('conditions','checks') and jsonb_typeof(val->k)<>'boolean' then raise exception 'bad %',part using errcode='22023'; end if;
    if part in ('roster','report') and (jsonb_typeof(val->k)<>'string' or char_length(val->>k)>1000) then raise exception 'bad %',part using errcode='22023'; end if;
   end loop;
  else raise exception 'bad patch' using errcode='22023'; end if;
 end loop;

 select t.version,t.content into v,tpl from report.pd_templates t where t.service_key=p_service order by t.version desc limit 1;
 if v is null then raise exception 'unknown service' using errcode='22023'; end if;
 insert into report.pd_runs(service_key,run_date,template_version,conditions,updated_by)
 values(p_service,p_date,v,report.pd_default_conditions(tpl,p_date),auth.uid())
 on conflict(service_key,run_date) do nothing;
 -- 오늘·앞으로의 회차가 옛 버전이면 최신으로 올린다.
 if p_date>=(now() at time zone 'Asia/Seoul')::date then
  update report.pd_runs set template_version=v,conditions=report.pd_default_conditions(tpl,p_date)||conditions
  where service_key=p_service and run_date=p_date and template_version<v;
 end if;

 update report.pd_runs set
  pd_name=coalesce(btrim(p_patch->>'pd'),pd_name),
  conditions=conditions||coalesce(p_patch->'conditions','{}'::jsonb),
  checks=(select coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb) from jsonb_each(checks||coalesce(p_patch->'checks','{}'::jsonb)) e where e.value='true'::jsonb),
  roster=(select coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb) from jsonb_each(roster||coalesce(p_patch->'roster','{}'::jsonb)) e where e.value<>'""'::jsonb),
  report=(select coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb) from jsonb_each(report||coalesce(p_patch->'report','{}'::jsonb)) e where e.value<>'""'::jsonb),
  updated_at=now(),updated_by=auth.uid()
 where service_key=p_service and run_date=p_date
 returning * into r;
 if octet_length(r.checks::text)+octet_length(r.roster::text)+octet_length(r.report::text)>60000 then raise exception 'run too large' using errcode='22023'; end if;
 return r;
end $$;

create or replace function report.pd_template_save(p_service text, p_base_version int, p_content jsonb) returns int
language plpgsql security definer set search_path='' as $$
declare cur int; c jsonb := p_content;
begin
 if not report.is_admin() then raise exception 'admin required' using errcode='42501'; end if;
 if p_service is null or p_service !~ '^[a-z0-9_]{1,20}$' then raise exception 'bad service' using errcode='22023'; end if;
 if jsonb_typeof(c) is distinct from 'object' or octet_length(c::text)>200000
  or jsonb_typeof(c->'name') is distinct from 'string' or char_length(c->>'name') not between 1 and 40
  or coalesce(c->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  or jsonb_typeof(c->'conditions') is distinct from 'array' or jsonb_typeof(c->'teams') is distinct from 'array'
  or jsonb_typeof(c#>'{page1,rows}') is distinct from 'array'
  or jsonb_typeof(c#>'{page2,flow}') is distinct from 'array' or jsonb_typeof(c#>'{page2,roster}') is distinct from 'array'
  or jsonb_typeof(c#>'{page2,during,items}') is distinct from 'array' or jsonb_typeof(c#>'{page2,after,items}') is distinct from 'array'
  or jsonb_typeof(c#>'{page2,report,categories}') is distinct from 'array' or jsonb_typeof(c#>'{page2,report,fields}') is distinct from 'array'
 then raise exception 'bad template' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtext('report.pd_templates:'||p_service));
 select max(version) into cur from report.pd_templates where service_key=p_service;
 if coalesce(cur,0)<>coalesce(p_base_version,-1) then raise exception 'version conflict' using errcode='22023'; end if;
 insert into report.pd_templates(service_key,version,content,created_by)
 values(p_service,coalesce(cur,0)+1,c||jsonb_build_object('id',p_service),auth.uid());
 -- 저장한 내용은 오늘·앞으로의 회차에 바로 보인다.
 perform report.pd_runs_follow_latest(p_service);
 return coalesce(cur,0)+1;
end $$;

-- 담당자 칸에서 담당 교역자(r5)·성찬 담당(r6)을 뺀 다음 버전. 칸이 모두 빠진 구분은 지운다.
do $$
declare s record; roster jsonb;
begin
 for s in select distinct on (service_key) service_key,version,content from report.pd_templates order by service_key,version desc loop
  if not exists(select 1 from jsonb_array_elements(s.content#>'{page2,roster}') g, jsonb_array_elements(g->'fields') f where f->>'id' in ('r5','r6')) then continue; end if;
  select coalesce(jsonb_agg(g2 order by ord),'[]') into roster from (
   select jsonb_set(g,'{fields}',(select coalesce(jsonb_agg(f order by fo),'[]') from jsonb_array_elements(g->'fields') with ordinality x(f,fo) where f->>'id' not in ('r5','r6'))) g2,ord
   from jsonb_array_elements(s.content#>'{page2,roster}') with ordinality t(g,ord)) z
  where jsonb_array_length(g2->'fields')>0;
  insert into report.pd_templates(service_key,version,content) values(s.service_key,s.version+1,jsonb_set(s.content,'{page2,roster}',roster));
 end loop;
end $$;

-- 지금 있는 오늘·앞으로의 회차를 최신 버전으로 맞춘다.
select report.pd_runs_follow_latest(service_key) from (select distinct service_key from report.pd_templates) s;
