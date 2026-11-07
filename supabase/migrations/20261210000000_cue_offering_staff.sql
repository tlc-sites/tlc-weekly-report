-- DB 50: 큐시트 순서(Contents)에서 헌금송(offsong)·헌금(offering) 줄을 빼고, 헌금위원(r7)을 담당(Staffs)으로 옮긴다(안내 다음, PD 앞).
-- 헌금 곡은 송리스트의 '헌금' 칸(song_off)에 적는다. 이미 적은 값(c_offsong·r7)은 회차에 그대로 남고, r7은 담당 칸에서 계속 보인다.
-- 뺀 줄의 시간대를 남은 줄이 아무도 덮지 않으면(라이프라인 18:55-19:05) 바로 앞 줄이 그 시간까지 이어진다.
-- 모든 예배의 최신 템플릿을 다음 버전으로 저장하고, 오늘·앞으로의 회차를 최신으로 맞춘다(DB 46 규칙).
do $$
declare s record; r jsonb; kept jsonb; staff jsonb; dropped text[] := array['offsong','offering']; pd_at int;
begin
 for s in select distinct on (service_key) service_key,version,content from report.pd_templates order by service_key,version desc loop
  if not (s.content ? 'cue') then continue; end if;
  if not exists(select 1 from jsonb_array_elements(s.content#>'{cue,rows}') x where x->>'id'=any(dropped))
   and exists(select 1 from jsonb_array_elements(s.content#>'{cue,staff}') x where x->>'key'='r7') then continue; end if;
  kept := '[]';
  for r in select x from jsonb_array_elements(s.content#>'{cue,rows}') x loop
   if r->>'id'=any(dropped) then
    -- 남은 줄 중 같은 시간대가 없으면 앞 줄을 늘린다.
    if not exists(select 1 from jsonb_array_elements(s.content#>'{cue,rows}') y
                  where not (y->>'id'=any(dropped)) and y->'from'=r->'from' and y->'to' is not distinct from r->'to')
       and jsonb_array_length(kept)>0 and kept->-1->'to'=r->'from' then
     kept := jsonb_set(kept,array[(jsonb_array_length(kept)-1)::text,'to'],r->'to');
    end if;
   else kept := kept||jsonb_build_array(r); end if;
  end loop;
  staff := s.content#>'{cue,staff}';
  if not exists(select 1 from jsonb_array_elements(staff) x where x->>'key'='r7') then
   select o-1 into pd_at from jsonb_array_elements(staff) with ordinality t(x,o) where x->>'key'='pd';
   staff := case when pd_at is null then staff||'[{"key":"r7","ko":"헌금위원","en":"Offering Team"}]'
            else jsonb_insert(staff,array[pd_at::text],'{"key":"r7","ko":"헌금위원","en":"Offering Team"}') end;
  end if;
  insert into report.pd_templates(service_key,version,content)
  values(s.service_key,s.version+1,jsonb_set(jsonb_set(s.content,'{cue,rows}',kept),'{cue,staff}',staff));
  perform report.pd_runs_follow_latest(s.service_key);
 end loop;
end $$;
