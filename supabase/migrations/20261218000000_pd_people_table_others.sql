-- DB 58: 2부·3부·라이프라인 PD 체크리스트에도 1부(DB 57)처럼 1쪽 맨 위에 '섬기는 사람' 표.
-- 표로 옮겨 빼는 체크: 헌금 메시지·말씀 합독 확인(a2·a3), 예배팀 도착(a9), '도착 확인' 소제목과 기술팀 도착 칸(c12~c14),
-- 각 STANDBY(e1·e2·e3·e6, 라이프라인 광고 e7·강대상 옮김 담당 e8). a10(순서 안내·기도)·e4(사운드체크)·e5(성찬 준비)는 남긴다.
-- 빼고 나서 빈 체크 묶음·빈 블록은 없앤다. 다만 집결 시각(arrivals)이 있는 블록은 남긴다(2부·3부 T-30: 도착 칸은 빠지고 팀·안내위원 집결 안내만 남음).
-- 사람은 담당자 칸이 있는 것만: 예배 인도·설교·헌금 메시지·말씀 합독·광고·헌금위원·안내위원·강대상 + 예배팀·기술팀.
-- 블록 시각은 가장 이른 블록과 T-60 중 이른 쪽(라이프라인 T-100). 이미 표가 있으면 건너뛴다. 새 버전 저장 후 회차를 최신으로(DB 46 규칙).
do $$
declare svc text; s record; c jsonb; rows_ jsonb;
 drop_ids text[] := array['a2','a3','a9','c12','c13','c14','e1','e2','e3','e6','e7','e8'];
 fields text[]; people jsonb; blk jsonb; p record; first_off int;
begin
 foreach svc in array array['sun2','sun3','life'] loop
  select distinct on (service_key) service_key,version,content into s
   from report.pd_templates where service_key=svc order by service_key,version desc;
  continue when s is null;
  continue when exists(select 1 from jsonb_array_elements(s.content#>'{page1,rows}') r,
   jsonb_array_elements(r) b, jsonb_array_elements(b->'items') i where i->>'type'='people');

  select min((b->>'offsetMin')::int) into first_off
   from jsonb_array_elements(s.content#>'{page1,rows}') r, jsonb_array_elements(r) b;

  -- 항목 정리: 뺄 체크·'도착' 소제목을 빼고, 체크 묶음은 뺄 칸만 덜어 내고 비면 없앤다. 빈 블록·빈 줄도 없앤다.
  select coalesce(jsonb_agg(nr order by ro),'[]') into rows_ from (
   select ro,(select jsonb_agg(nb order by bo) from (
     select bo,b||jsonb_build_object('items',coalesce((
       select jsonb_agg(ni order by o) from (
        select o,case when i->>'type'='checkGroup'
          then i||jsonb_build_object('items',coalesce((select jsonb_agg(x order by xo)
           from jsonb_array_elements(i->'items') with ordinality w(x,xo)
           where not (x->>'id'=any(drop_ids))),'[]'))
          else i end ni
        from jsonb_array_elements(b->'items') with ordinality t(i,o)
        where not (coalesce(i->>'id','')=any(drop_ids))
          and not (i->>'type'='heading' and i->>'text' like '도착%')
       ) k where not (ni->>'type'='checkGroup' and jsonb_array_length(ni->'items')=0)),'[]')) nb
     from jsonb_array_elements(r) with ordinality u(b,bo)) m
    where jsonb_array_length(nb->'items')>0 or jsonb_array_length(coalesce(nb->'arrivals','[]'))>0) nr
   from jsonb_array_elements(s.content#>'{page1,rows}') with ordinality v(r,ro)) z
  where nr is not null;

  select array_agg(f->>'id') into fields
   from jsonb_array_elements(s.content#>'{page2,roster}') g, jsonb_array_elements(g->'fields') f;
  people := '[]';
  for p in select * from (values (1,'r1','예배 인도'),(2,'r2','설교'),(3,'r3','헌금 메시지'),(4,'r4','말씀 합독'),
    (5,'r16','광고'),(6,'r7','헌금위원'),(7,'r8','안내위원'),(8,'r17','강대상')) x(n,f,l) order by n loop
   if p.f=any(fields) then
    people := people||jsonb_build_array(jsonb_build_object('key',p.f,'label',p.l,'field',p.f));
   end if;
  end loop;
  people := people||'[{"key":"wt","label":"예배팀","sub":"악기·싱어"},
   {"key":"tech","label":"기술팀","sub":"음향·영상·자막·조명"}]';
  blk := jsonb_build_object('id','blk_people','offsetMin',least(-60,coalesce(first_off,-60)),
   'label','섬기는 사람','title','확인 → 도착 → STANDBY','style','accent','wide',true,
   'items',jsonb_build_array(jsonb_build_object('type','people',
    'steps','[{"key":"ok","label":"확인"},{"key":"in","label":"도착"},{"key":"sb","label":"STANDBY"}]'::jsonb,
    'people',people)));
  -- 맨 위에 한 줄로. 줄이 이미 3개(최대)면 첫 줄 맨 앞에 둔다.
  if jsonb_array_length(rows_)<3 then rows_ := jsonb_build_array(jsonb_build_array(blk))||rows_;
  else rows_ := jsonb_set(rows_,'{0}',jsonb_build_array(blk)||(rows_->0)); end if;

  c := jsonb_set(s.content,'{page1,rows}',rows_);
  insert into report.pd_templates(service_key,version,content) values(s.service_key,s.version+1,c);
  perform report.pd_runs_follow_latest(s.service_key);
 end loop;
end $$;
