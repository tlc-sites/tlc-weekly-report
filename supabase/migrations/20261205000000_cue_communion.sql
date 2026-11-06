-- DB 45: 큐시트에 성찬 순서를 넣는다. 성찬주간 스위치(회차 conditions.communion, PD 체크리스트와 같은 값)가 켜졌을 때만 보인다.
-- 주일 1~3부 최신 템플릿의 cue.rows에서 헌금 다음에 성찬(담당 r6 = PD 체크리스트 '성찬 담당' 칸)을 넣고 다음 버전으로 저장한다. 이미 있으면 건너뛴다.
do $$
declare s record; rows jsonb;
 comm jsonb := '{"id":"communion","ko":"성찬","en":"Communion","from":20,"to":35,"condition":"communion","lines":[{"key":"r6","hint":"성찬 담당"}]}';
begin
 for s in select distinct on (service_key) service_key,version,content from report.pd_templates
  where service_key in ('sun1','sun2','sun3') order by service_key,version desc loop
  if not (s.content ? 'cue') or exists(select 1 from jsonb_array_elements(s.content#>'{cue,rows}') r where r->>'id'='communion') then continue; end if;
  -- 헌금 행과 같은 시간대로 둔다(인쇄에서 같은 시간 칸으로 합쳐진다).
  select coalesce(jsonb_agg(x order by o,k),'[]') into rows from (
   select r x,ord o,0 k from jsonb_array_elements(s.content#>'{cue,rows}') with ordinality t(r,ord)
   union all
   select comm||coalesce((select jsonb_build_object('from',r->'from','to',r->'to') from jsonb_array_elements(s.content#>'{cue,rows}') r where r->>'id'='offering'),'{}'),
    coalesce((select ord from jsonb_array_elements(s.content#>'{cue,rows}') with ordinality t(r,ord) where r->>'id'='offering'),999),1
  ) z;
  insert into report.pd_templates(service_key,version,content) values(s.service_key,s.version+1,jsonb_set(s.content,'{cue,rows}',rows));
 end loop;
end $$;
