-- DB 52: 큐시트 담당(Staffs)에서 녹음팀(r19, 1부에만 있음)을 뺀다. 이미 적은 r19 값은 회차에 그대로 남는다.
-- 해당 예배의 최신 템플릿을 다음 버전으로 저장하고, 오늘·앞으로의 회차를 최신으로 맞춘다(DB 46 규칙). 다시 돌려도 건너뛴다.
do $$
declare s record;
begin
 for s in select distinct on (service_key) service_key,version,content from report.pd_templates order by service_key,version desc loop
  if not exists(select 1 from jsonb_array_elements(s.content#>'{cue,staff}') x where x->>'key'='r19') then continue; end if;
  insert into report.pd_templates(service_key,version,content)
  values(s.service_key,s.version+1,jsonb_set(s.content,'{cue,staff}',
   (select coalesce(jsonb_agg(x order by o),'[]') from jsonb_array_elements(s.content#>'{cue,staff}') with ordinality t(x,o) where x->>'key'<>'r19')));
  perform report.pd_runs_follow_latest(s.service_key);
 end loop;
end $$;
