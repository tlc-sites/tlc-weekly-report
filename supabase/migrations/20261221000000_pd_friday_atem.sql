-- DB 61: 금요예배 PD 체크리스트에 부산 ATEM 점검.
-- 이름에 '금요'가 들어간 예배(편집 화면에서 복제해
-- 만든 것)의 1쪽 T-30 무렵 블록에, 주일 1부와 같은
-- '부산 캠퍼스 · 영상팀 + 부산 담당'(연결·담당자 연락·
-- 영상 수신·음향 수신) · '층별 송출' 위치표 · 기준
-- 문구를 붙이고 블록을 넓게(2칸) 둔다.
-- 붙일 내용은 운영 주일 1부(없으면 라이프라인) 최신
-- 버전에서 그대로 가져온다(체크 ID d1~d7 같음).
-- 이미 '부산 캠퍼스' 소제목이 있으면 건너뛴다.
-- 붙일 블록: 섬기는 사람 표가 아닌 블록 중 시각이
-- T-40~T-15이고 T-30에 가장 가까운 것('시스템' 제목
-- 우선). 없으면 건너뛴다.
-- 채팅에서 복사해 SQL Editor에 넣으므로 줄을 짧게 둔다.
do $$
declare
 src jsonb; atem jsonb; s record;
 c jsonb; blk jsonb; ri int; bi int;
 ids text[];
begin
 -- 붙일 내용: '부산 캠퍼스' 소제목부터 블록 끝까지
 select t.content into src
  from report.pd_templates t
  where t.service_key in ('sun1','life')
  order by t.service_key = 'sun1' desc,
    t.version desc
  limit 1;
 select b into blk
  from jsonb_array_elements(
         src#>'{page1,rows}') r,
       jsonb_array_elements(r) b
  where b::text like '%부산 캠퍼스%'
  limit 1;
 if blk is null then
  raise exception '부산 ATEM 원본 블록 없음';
 end if;
 select jsonb_agg(i order by o) into atem
  from jsonb_array_elements(blk->'items')
    with ordinality x(i, o)
  where o >= (
   select min(o2)
   from jsonb_array_elements(blk->'items')
     with ordinality y(i2, o2)
   where i2->>'type' = 'heading'
     and i2->>'text' like '부산 캠퍼스%');

 for s in
  select distinct on (service_key)
    service_key, version, content
  from report.pd_templates
  where service_key not in
    ('sun1','sun2','sun3','life')
  order by service_key, version desc
 loop
  continue when
   s.content->>'name' not like '%금요%';
  continue when
   s.content::text like '%부산 캠퍼스%';

  -- 체크 ID가 겹치면 멈춘다(다른 체크와 섞임 방지)
  select array_agg(v#>>'{}') into ids
   from jsonb_path_query(s.content,
     'strict $.**.id') v
   where v#>>'{}' in ('d1','d2','d3',
     'd4','d5','d6','d7');
  if ids is not null then
   raise exception '% 체크 ID 겹침 %',
    s.service_key, ids;
  end if;

  ri := null;
  select x.ro - 1, y.bo - 1
   into ri, bi
   from jsonb_array_elements(
          s.content#>'{page1,rows}')
          with ordinality x(r, ro),
        jsonb_array_elements(x.r)
          with ordinality y(b, bo)
   where not exists(
      select 1
      from jsonb_array_elements(
             y.b->'items') q
      where q->>'type' = 'people')
     and (y.b->>'offsetMin')::int
       between -40 and -15
   order by
    abs((y.b->>'offsetMin')::int + 30),
    (y.b->>'title' like '%시스템%') desc,
    x.ro, y.bo
   limit 1;
  if ri is null then
   raise notice '% 붙일 블록 없음',
    s.service_key;
   continue;
  end if;

  blk := s.content #> array['page1',
    'rows', ri::text, bi::text];
  blk := blk || jsonb_build_object(
   'wide', true,
   'items', (blk->'items') || atem,
   'title', case
    when coalesce(blk->>'title','')
      like '%ATEM%'
     then blk->>'title'
    else coalesce(nullif(
      blk->>'title', ''), '시스템')
     || ' · 부산 ATEM' end);
  c := jsonb_set(s.content,
   array['page1','rows', ri::text,
     bi::text], blk);

  insert into report.pd_templates(
    service_key, version, content)
   values (s.service_key,
     s.version + 1, c);
  perform report.pd_runs_follow_latest(
    s.service_key);
 end loop;
end $$;
