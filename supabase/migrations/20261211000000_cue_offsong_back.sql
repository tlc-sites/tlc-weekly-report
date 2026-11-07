-- DB 51: 큐시트 순서(Contents)에 헌금송(offsong, 값 c_offsong) 줄을 헌금인도 다음에 다시 넣고, 담당(Staffs)에서 중계 믹싱(r20)을 뺀다.
-- 헌금송 줄의 시간은 그 줄이 있던 마지막 버전에서 가져온다. 그때보다 헌금인도가 늘어나 있으면(DB 50, 라이프라인) 그때 끝 시각으로 되돌린다.
-- 헌금위원(r7)은 DB 50대로 담당에 둔다. 이미 적은 c_offsong·r20 값은 회차에 그대로 남는다.
-- 모든 예배의 최신 템플릿을 다음 버전으로 저장하고, 오늘·앞으로의 회차를 최신으로 맞춘다(DB 46 규칙). 다시 돌려도 건너뛴다.
do $$
declare s record; prev jsonb; off jsonb; lead_prev jsonb; rows_ jsonb; staff jsonb; at_ int;
begin
 for s in select distinct on (service_key) service_key,version,content from report.pd_templates order by service_key,version desc loop
  if not (s.content ? 'cue') then continue; end if;
  rows_ := s.content#>'{cue,rows}'; staff := s.content#>'{cue,staff}';
  if exists(select 1 from jsonb_array_elements(rows_) x where x->>'id'='offsong')
   and not exists(select 1 from jsonb_array_elements(staff) x where x->>'key'='r20') then continue; end if;

  if not exists(select 1 from jsonb_array_elements(rows_) x where x->>'id'='offsong') then
   select t.content#>'{cue,rows}' into prev from report.pd_templates t
    where t.service_key=s.service_key and exists(select 1 from jsonb_array_elements(t.content#>'{cue,rows}') x where x->>'id'='offsong')
    order by t.version desc limit 1;
   select x into off from jsonb_array_elements(prev) x where x->>'id'='offsong';
   select x into lead_prev from jsonb_array_elements(prev) x where x->>'id'='offlead';
   select o-1 into at_ from jsonb_array_elements(rows_) with ordinality t(x,o) where x->>'id'='offlead';
   if off is null then
    -- 예전 버전이 없으면 헌금인도와 같은 시간대로 만든다.
    off := jsonb_build_object('id','offsong','ko','헌금송','en','Offering Song','lines','[{"key":"c_offsong"}]'::jsonb)
           ||coalesce((select jsonb_build_object('from',x->'from','to',x->'to') from jsonb_array_elements(rows_) x where x->>'id'='offlead'),'{"from":0,"to":null}');
   end if;
   if at_ is null then rows_ := rows_||jsonb_build_array(off);
   else
    -- 헌금인도가 헌금송 끝까지 늘어나 있으면 예전 끝 시각으로 되돌린다.
    if lead_prev is not null and rows_->at_->'to'=off->'to' and lead_prev->'to' is distinct from off->'to' then
     rows_ := jsonb_set(rows_,array[at_::text,'to'],lead_prev->'to');
    end if;
    rows_ := jsonb_insert(rows_,array[at_::text],off,true);
   end if;
  end if;

  staff := (select coalesce(jsonb_agg(x order by o),'[]') from jsonb_array_elements(staff) with ordinality t(x,o) where x->>'key'<>'r20');
  insert into report.pd_templates(service_key,version,content)
  values(s.service_key,s.version+1,jsonb_set(jsonb_set(s.content,'{cue,rows}',rows_),'{cue,staff}',staff));
  perform report.pd_runs_follow_latest(s.service_key);
 end loop;
end $$;
