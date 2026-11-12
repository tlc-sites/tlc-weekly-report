-- DB 57: 1부 PD 체크리스트 1쪽 맨 위에 '섬기는 사람' 표(type people)를 넣는다.
-- 사람(열)마다 확인 → 도착 → STANDBY 체크, 이름은 표에서 바로 적는다(담당자 칸 roster와 같은 값이라 큐시트와 함께 보인다).
-- 표가 이름을 받는 칸(예배 인도자·설교자·헌금 메시지·말씀 합독·헌금위원·안내위원)은 앱에서 2쪽 담당자 칸에서 빠진다(기술팀 칸은 2쪽에 남는다).
-- 블록 곳곳의 사람 확인 체크(헌금 메시지·말씀 합독 확인/도착, 각 STANDBY, 예배팀·음향팀 기도 시작, '도착 확인' 소제목)는 표로 옮겨 빼고,
-- 성찬 리마인드(c9)·성찬 준비 상태(e5)는 T-45 '성찬 순서·자막·준비'(b3) 하나로 합친다.
-- 운영 양식은 편집 화면으로 바뀌므로 ID로 찾아 있으면 바꾼다. 이미 표가 있으면 건너뛴다. 새 버전 저장 후 오늘·앞으로의 회차를 최신으로(DB 46 규칙).
do $$
declare s record; c jsonb; rows_ jsonb; drop_ids text[] := array['a2','a3','a7','c10','c11','e1','e2','e3','e6','c9','e5'];
 fields text[]; people jsonb := '[]'; blk jsonb; p record;
begin
 select distinct on (service_key) service_key,version,content into s from report.pd_templates where service_key='sun1' order by service_key,version desc;
 if s is null then return; end if;
 if exists(select 1 from jsonb_array_elements(s.content#>'{page1,rows}') r, jsonb_array_elements(r) b, jsonb_array_elements(b->'items') i where i->>'type'='people') then return; end if;

 -- 1쪽 항목 정리: 옮긴 체크·'도착' 소제목을 빼고, b3 문구를 바꾼다.
 select jsonb_agg(
   (select jsonb_agg(
     b||jsonb_build_object('items',coalesce((select jsonb_agg(case when i->>'id'='b3' then i||'{"text":"성찬 순서·자막·준비"}' else i end order by o)
       from jsonb_array_elements(b->'items') with ordinality t(i,o)
       where not (coalesce(i->>'id','')=any(drop_ids)) and not (i->>'type'='heading' and i->>'text' like '도착%')),'[]'))
     order by bo) from jsonb_array_elements(r) with ordinality u(b,bo))
   order by ro)
 into rows_ from jsonb_array_elements(s.content#>'{page1,rows}') with ordinality v(r,ro);

 -- 사람: 담당자 칸이 있으면 이름 칸으로, 예배팀·기술팀은 작은 글만.
 select array_agg(f->>'id') into fields from jsonb_array_elements(s.content#>'{page2,roster}') g, jsonb_array_elements(g->'fields') f;
 for p in select * from (values (1,'r1','예배 인도'),(2,'r2','설교'),(3,'r3','헌금 메시지'),(4,'r4','말씀 합독'),(5,'r7','헌금위원'),(6,'r8','안내위원')) x(n,f,l) order by n loop
  if p.f=any(fields) then people := people||jsonb_build_array(jsonb_build_object('key',p.f,'label',p.l,'field',p.f)); end if;
 end loop;
 people := people||'[{"key":"wt","label":"예배팀","sub":"악기·싱어"},{"key":"tech","label":"기술팀","sub":"음향·영상·자막·조명"}]';
 blk := jsonb_build_object('id','blk_people','offsetMin',-60,'label','섬기는 사람','title','확인 → 도착 → STANDBY','style','accent','wide',true,
  'items',jsonb_build_array(jsonb_build_object('type','people','steps','[{"key":"ok","label":"확인"},{"key":"in","label":"도착"},{"key":"sb","label":"STANDBY"}]'::jsonb,'people',people)));
 -- 맨 위에 한 줄로. 줄이 이미 3개(최대)면 첫 줄 맨 앞에 둔다.
 if jsonb_array_length(rows_)<3 then rows_ := jsonb_build_array(jsonb_build_array(blk))||rows_;
 else rows_ := jsonb_set(rows_,'{0}',jsonb_build_array(blk)||(rows_->0)); end if;

 c := jsonb_set(s.content,'{page1,rows}',rows_);
 insert into report.pd_templates(service_key,version,content) values(s.service_key,s.version+1,c);
 perform report.pd_runs_follow_latest(s.service_key);
end $$;
