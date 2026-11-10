-- DB 55: PD 체크리스트 1쪽의 '부산 ATEM 층별 송출' 블록을 바로 앞 시각(10분 안)의 같은 줄 블록(T-30 시스템 · 도착)에 합친다(라이프라인·1부).
-- 합친 블록은 '넓게'(두 칸, 안쪽 두 단)로 둔다. 합친 블록 = 앞 블록의 '도착 확인' 앞 내용(시스템 점검 등) → 부산 ATEM 내용(부산 캠퍼스·층별 송출·기준) → '도착 확인'부터 끝.
-- 앞 내용 체크 묶음의 '부산' 칸은 부산 ATEM 칸과 겹쳐 뺀다. 체크 ID는 그대로라 이미 한 체크는 이어진다. 도착 안내(arrivals)는 앞 블록 것을 쓴다.
-- 1부(sun1)에는 함께 더한다: T-10 STANDBY에 '목사님·사모님 마이크 컨퍼런스룸 전달', '예배 전 의전 음료 확인',
--   2쪽 '예배 진행 중'에 '설교 등단 전 마이크 위치 확인'(편집 모드에서 옮길 수 있음).
-- 바뀐 것이 있는 예배만 다음 버전으로 저장하고, 오늘·앞으로의 회차를 최신으로 맞춘다(DB 46 규칙). 다시 돌려도 건너뛴다.
do $$
declare s record; c jsonb; rows_ jsonb; ri int; atem jsonb; ai int; base jsonb; bi int; cut int; pre jsonb; post jsonb; merged jsonb; changed boolean;
begin
 for s in select distinct on (service_key) service_key,version,content from report.pd_templates order by service_key,version desc loop
  c := s.content; changed := false;
  rows_ := c#>'{page1,rows}';
  for ri in 0..coalesce(jsonb_array_length(rows_),0)-1 loop
   atem := null; base := null;
   select b, o-1 into atem, ai from jsonb_array_elements(rows_->ri) with ordinality x(b,o) where b->>'label'='부산 ATEM' limit 1;
   if atem is null then continue; end if;
   select b, o-1 into base, bi from jsonb_array_elements(rows_->ri) with ordinality x(b,o)
    where b->>'label'<>'부산 ATEM' and (b->>'offsetMin')::int <= (atem->>'offsetMin')::int and (atem->>'offsetMin')::int - (b->>'offsetMin')::int <= 10
    order by (b->>'offsetMin')::int desc limit 1;
   if base is null then continue; end if;
   select min(o) into cut from jsonb_array_elements(base->'items') with ordinality y(i,o) where i->>'type'='heading' and i->>'text' like '도착%';
   cut := coalesce(cut, 999);
   select coalesce(jsonb_agg(case when i->>'type'='checkGroup'
     then jsonb_set(i,'{items}',(select coalesce(jsonb_agg(g order by go),'[]') from jsonb_array_elements(i->'items') with ordinality z(g,go) where g->>'text'<>'부산'))
     else i end order by o),'[]') into pre from jsonb_array_elements(base->'items') with ordinality x(i,o) where o < cut;
   select coalesce(jsonb_agg(i order by o),'[]') into post from jsonb_array_elements(base->'items') with ordinality x(i,o) where o >= cut;
   merged := base||jsonb_build_object('wide',true,'title',coalesce(nullif(base->>'title',''),'시스템')||' · 부산 ATEM','items',pre||(atem->'items')||post);
   rows_ := jsonb_set(rows_,array[ri::text],(select jsonb_agg(case when o-1=bi then merged else b end order by o) from jsonb_array_elements(rows_->ri) with ordinality x(b,o) where o-1<>ai));
   changed := true;
  end loop;
  if changed then c := jsonb_set(c,'{page1,rows}',rows_); end if;

  if s.service_key='sun1' and not (c::text like '%"e_mic"%') then
   rows_ := c#>'{page1,rows}';
   for ri in 0..jsonb_array_length(rows_)-1 loop
    select o-1 into bi from jsonb_array_elements(rows_->ri) with ordinality x(b,o) where b->>'label'='T-10' limit 1;
    if bi is not null then
     rows_ := jsonb_set(rows_,array[ri::text,bi::text,'items'],(rows_->ri->bi->'items')||
      '[{"id":"e_mic","text":"목사님·사모님 마이크 컨퍼런스룸 전달","type":"check"},{"id":"e_drink","text":"예배 전 의전 음료 확인","type":"check"}]'::jsonb);
     exit;
    end if;
   end loop;
   c := jsonb_set(c,'{page1,rows}',rows_);
   c := jsonb_set(c,'{page2,during,items}',(c#>'{page2,during,items}')||'[{"id":"j_micpos","text":"설교 등단 전 마이크 위치 확인","type":"check","emphasis":"strong"}]'::jsonb);
   changed := true;
  end if;

  if changed then
   insert into report.pd_templates(service_key,version,content) values(s.service_key,s.version+1,c);
   perform report.pd_runs_follow_latest(s.service_key);
  end if;
 end loop;
end $$;
