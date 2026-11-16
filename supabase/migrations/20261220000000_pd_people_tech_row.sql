-- DB 60: 섬기는 사람 표에서 기술팀 한 칸(tech)을 빼고,
-- 그 아래에 '기술팀' 표를 따로 둔다(사용자 선택 C2).
-- 기술팀 표: 음향·영상·사진·자막·조명·부산(담당자 칸이
-- 있는 것만), 이름은 표에서 적고(2쪽 기술팀 칸은 빠짐),
-- 도착·STANDBY를 칸마다 한 줄로(inline).
-- 위 표에는 묶음 이름 '순서·위원'을 붙인다.
-- 대상: 1부·2부·3부·라이프라인. tech 칸이 없거나 이미
-- 표가 둘이면 건너뛴다. 새 버전 저장 후 회차를 최신으로.
-- 채팅에서 복사해 SQL Editor에 넣으므로 줄을 짧게 둔다.
do $$
declare
 svc text; s record; c jsonb; it jsonb;
 ri int; bi int; ii int; cnt int;
 fields text[]; tech jsonb; p record;
begin
 foreach svc in array
   array['sun1','sun2','sun3','life']
 loop
  select distinct on (service_key)
    service_key, version, content
   into s
   from report.pd_templates
   where service_key = svc
   order by service_key, version desc;
  continue when s is null;

  -- 표가 몇 개인지, tech 칸이 있는 표 위치
  select count(*) into cnt
   from jsonb_array_elements(
          s.content#>'{page1,rows}') r,
        jsonb_array_elements(r) b,
        jsonb_array_elements(b->'items') i
   where i->>'type' = 'people';
  continue when cnt <> 1;

  ri := null;
  select v.ro - 1, u.bo - 1, t.io - 1
   into ri, bi, ii
   from jsonb_array_elements(
          s.content#>'{page1,rows}')
          with ordinality v(r, ro),
        jsonb_array_elements(v.r)
          with ordinality u(b, bo),
        jsonb_array_elements(u.b->'items')
          with ordinality t(i, io)
   where t.i->>'type' = 'people'
     and exists(
      select 1
      from jsonb_array_elements(
             t.i->'people') q
      where q->>'key' = 'tech');
  continue when ri is null;

  -- 기술팀 사람: 담당자 칸이 있는 것만
  select array_agg(f->>'id') into fields
   from jsonb_array_elements(
          s.content#>'{page2,roster}') g,
        jsonb_array_elements(g->'fields') f;
  tech := '[]';
  for p in
   select * from (values
    (1,'r10','음향'),
    (2,'r11','영상'),
    (3,'r12','사진'),
    (4,'r13','자막'),
    (5,'r14','조명'),
    (6,'r15','부산')) x(n, f, l)
   order by n
  loop
   if p.f = any(fields) then
    tech := tech || jsonb_build_array(
     jsonb_build_object(
      'key', p.f, 'label', p.l,
      'field', p.f));
   end if;
  end loop;
  continue when jsonb_array_length(tech) = 0;

  -- 위 표: tech 칸 빼고 묶음 이름
  it := s.content #> array['page1','rows',
    ri::text, bi::text, 'items', ii::text];
  it := it || jsonb_build_object(
   'caption', '순서·위원',
   'people', (
    select jsonb_agg(q order by qo)
    from jsonb_array_elements(it->'people')
      with ordinality w(q, qo)
    where q->>'key' <> 'tech'));
  c := jsonb_set(s.content,
   array['page1','rows', ri::text,
     bi::text, 'items', ii::text], it);

  -- 바로 뒤에 기술팀 표
  c := jsonb_insert(c,
   array['page1','rows', ri::text,
     bi::text, 'items', ii::text],
   jsonb_build_object(
    'type', 'people',
    'caption', '기술팀',
    'inline', true,
    'steps', jsonb_build_array(
     jsonb_build_object(
      'key','in','label','도착'),
     jsonb_build_object(
      'key','sb','label','STANDBY')),
    'people', tech),
   true);

  insert into report.pd_templates(
    service_key, version, content)
   values (s.service_key, s.version + 1, c);
  perform report.pd_runs_follow_latest(
    s.service_key);
 end loop;
end $$;
