-- DB 63: 음향팀을 PA·녹음/모니터링·중계 믹스로 나눈다.
-- 큐시트 담당(Staffs)과 PD 체크리스트 명단에 함께 적용.
-- 큐시트 담당 칸:
--  음향팀(r10) → PA, 그 뒤에 녹음·모니터링(r19)·
--  중계 믹스(r20). 영상팀 뒤에 사진팀(r12).
--  안내 앞에 부산 교역자(r15)·부산 음향(r21).
--  (r12·r15는 체크리스트 사진·부산 칸과 같은 키라
--  큐시트에 적으면 체크리스트에도 보인다.)
-- 새 양식 명단(roster)이 있으면: 기술팀 줄의 음향을
--  빼고 그 위에 '음향팀' 줄(PA·녹음·중계),
--  '부산 담당'은 '부산 교역자'로, 그 뒤에 부산 음향.
-- 대상: 큐시트가 있는 예배(1·2·3부·라이프라인).
-- 이미 r21이 있으면 건너뛴다. 새 버전 저장 후
-- 회차를 최신으로(DB 46 규칙).
do $$
declare
 s record; c jsonb; st jsonb;
 ri int; bi int; ii int;
 it jsonb; ln jsonb; nl jsonb;
begin
 for s in
  select distinct on (service_key)
    service_key, version, content
   from report.pd_templates
   order by service_key, version desc
 loop
  c := s.content;
  continue when c->'cue' is null;
  continue when exists(
   select 1 from jsonb_array_elements(
    c#>'{cue,staff}') x
   where x->>'key' = 'r21');
  continue when not exists(
   select 1 from jsonb_array_elements(
    c#>'{cue,staff}') x
   where x->>'key' = 'r10');

  -- 큐시트 담당 칸
  with t as (
   select x, o
    from jsonb_array_elements(c#>'{cue,staff}')
     with ordinality t(x, o)
    where x->>'key' not in
     ('r19','r20','r12','r15','r21')
  ), u as (
   select case when x->>'key' = 'r10' then
     '{"key":"r10","ko":"PA","en":"PA"}'::jsonb
    else x end y, o, 0 k from t
   union all
   select '{"key":"r19","ko":"녹음·모니터링",
"en":"Recording·Monitoring"}'::jsonb, o, 1
    from t where x->>'key' = 'r10'
   union all
   select '{"key":"r20","ko":"중계 믹스",
"en":"Live Streaming"}'::jsonb, o, 2
    from t where x->>'key' = 'r10'
   union all
   select '{"key":"r12","ko":"사진팀",
"en":"Photo"}'::jsonb, o, 1
    from t where x->>'key' = 'r11'
   union all
   select '{"key":"r15","ko":"부산 교역자",
"en":"Busan Pastor"}'::jsonb, o, -2
    from t where x->>'key' = 'r8'
   union all
   select '{"key":"r21","ko":"부산 음향",
"en":"Busan Sound"}'::jsonb, o, -1
    from t where x->>'key' = 'r8'
  )
  select jsonb_agg(y order by o, k) into st from u;
  c := jsonb_set(c, '{cue,staff}', st);

  -- 새 양식 명단(있을 때만)
  for ri in 0 ..
   jsonb_array_length(c#>'{page1,rows}') - 1 loop
  for bi in 0 ..
   jsonb_array_length(c#>array['page1','rows',
    ri::text]) - 1 loop
  for ii in 0 ..
   jsonb_array_length(c#>array['page1','rows',
    ri::text,bi::text,'items']) - 1 loop
   it := c#>array['page1','rows',ri::text,
    bi::text,'items',ii::text];
   continue when it->>'type' <> 'roster';
   nl := '[]';
   for ln in
    select x from jsonb_array_elements(
     it->'lines') with ordinality t(x, o)
    order by o
   loop
    if exists(select 1 from
      jsonb_array_elements(ln->'cols') y
      where y->>'field' = 'r10') then
     nl := nl || jsonb_build_array(
      '{"label":"음향팀","cols":[
{"label":"PA","field":"r10","w":1.4},
{"label":"녹음·모니터링","field":"r19"},
{"label":"중계 믹스","field":"r20"}]}'::jsonb);
     select jsonb_agg(z order by o) into st
      from (
       select case when y->>'field' = 'r15'
         then y || '{"label":"부산 교역자"}'
         else y end z, o * 2 o
        from jsonb_array_elements(ln->'cols')
         with ordinality t(y, o)
        where y->>'field' not in ('r10','r21')
       union all
       select '{"label":"부산 음향",
"field":"r21"}'::jsonb, o * 2 + 1
        from jsonb_array_elements(ln->'cols')
         with ordinality t(y, o)
        where y->>'field' = 'r15'
      ) q;
     if st is not null then
      nl := nl || jsonb_build_array(
       jsonb_set(ln, '{cols}', st));
     end if;
    else
     nl := nl || jsonb_build_array(ln);
    end if;
   end loop;
   c := jsonb_set(c, array['page1','rows',
    ri::text,bi::text,'items',ii::text,'lines'],
    nl);
  end loop; end loop; end loop;

  insert into report.pd_templates
   (service_key, version, content)
  values (s.service_key, s.version + 1, c);
  perform report.pd_runs_follow_latest(
   s.service_key);
 end loop;
end $$;
