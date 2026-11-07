-- DB 53: PD 체크리스트 담당자 칸에서 '예배팀'(악기 r18·싱어 r9) 구분을 뺀다(2쪽이 3페이지로 넘치던 문제). 예배 인도자(r1)는 '순서'에 그대로 둔다.
-- 악기·싱어는 큐시트 담당(Staffs)에서 계속 적고 인쇄한다(같은 회차 roster 값, 지운 값 없음).
-- 해당 예배의 최신 템플릿을 다음 버전으로 저장하고, 오늘·앞으로의 회차를 최신으로 맞춘다(DB 46 규칙). 다시 돌려도 건너뛴다.
do $$
declare s record;
begin
 for s in select distinct on (service_key) service_key,version,content from report.pd_templates order by service_key,version desc loop
  if not exists(select 1 from jsonb_array_elements(s.content#>'{page2,roster}') g
                where g->>'group'='예배팀' or not exists(select 1 from jsonb_array_elements(g->'fields') f where f->>'id' not in ('r18','r9'))) then continue; end if;
  insert into report.pd_templates(service_key,version,content)
  values(s.service_key,s.version+1,jsonb_set(s.content,'{page2,roster}',
   (select coalesce(jsonb_agg(g order by o),'[]') from jsonb_array_elements(s.content#>'{page2,roster}') with ordinality t(g,o)
    where not (g->>'group'='예배팀' or not exists(select 1 from jsonb_array_elements(g->'fields') f where f->>'id' not in ('r18','r9'))))));
  perform report.pd_runs_follow_latest(s.service_key);
 end loop;
end $$;
