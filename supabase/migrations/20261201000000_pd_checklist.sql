-- 예배 PD 체크리스트 1단계: 예배별 템플릿(관리자 편집은 2단계)과 날짜 × 예배 회차 기록.
-- 템플릿은 고치지 않고 새 버전을 더한다. 회차는 만들 때의 버전을 기억해 템플릿이 바뀌어도 지난 기록이 그대로 보인다.
create table report.pd_templates(
 service_key text not null check(service_key ~ '^[a-z0-9_]{1,20}$'),
 version int not null check(version>0),
 content jsonb not null check(jsonb_typeof(content)='object'),
 created_by uuid references report.profiles(id),
 created_at timestamptz not null default now(),
 primary key(service_key,version));
alter table report.pd_templates enable row level security;
revoke all on report.pd_templates from public,anon,authenticated;
grant select on report.pd_templates to authenticated;
create policy pd_templates_read on report.pd_templates for select to authenticated using(report.is_active_user());

-- 회차: 승인된 사용자 누구나 그날 PD가 될 수 있다(당일 대타 포함). 쓰기는 아래 함수로만 한다.
-- checks에는 체크된 ID만 true로 남긴다. 체크 하나씩 따로 저장해 여러 기기가 동시에 눌러도 서로 지우지 않는다.
create table report.pd_runs(
 service_key text not null,
 run_date date not null check(extract(dow from run_date)=0),
 template_version int not null,
 pd_name text not null default '' check(char_length(pd_name)<=40),
 conditions jsonb not null default '{}' check(jsonb_typeof(conditions)='object'),
 checks jsonb not null default '{}' check(jsonb_typeof(checks)='object'),
 roster jsonb not null default '{}' check(jsonb_typeof(roster)='object'),
 report jsonb not null default '{}' check(jsonb_typeof(report)='object'),
 updated_at timestamptz not null default now(),
 updated_by uuid references report.profiles(id),
 primary key(service_key,run_date),
 foreign key(service_key,template_version) references report.pd_templates(service_key,version));
alter table report.pd_runs enable row level security;
revoke all on report.pd_runs from public,anon,authenticated;
grant select on report.pd_runs to authenticated;
create policy pd_runs_read on report.pd_runs for select to authenticated using(report.is_active_user());

-- 회차 기본 조건: 템플릿의 기본값, 성찬주간은 그 주일이 1~7일이면 켠다.
create function report.pd_default_conditions(tpl jsonb, d date) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_object_agg(c->>'id',case when c->>'id'='communion' then to_jsonb(extract(day from d)<=7) else coalesce(c->'default','false'::jsonb) end),'{}'::jsonb)
 from jsonb_array_elements(coalesce(tpl->'conditions','[]'::jsonb)) c
$$;

-- 바뀐 칸만 받아 합친다. patch 예: {"checks":{"a1":true}}, {"roster":{"r7":"김OO, 이OO"}}, {"pd":"홍길동"}, {"conditions":{"news":false}}
create function report.pd_run_save(p_service text, p_date date, p_patch jsonb) returns report.pd_runs
language plpgsql security definer set search_path='' as $$
declare v int; tpl jsonb; part text; k text; val jsonb; r report.pd_runs;
begin
 if not report.is_active_user() then raise exception 'active user required' using errcode='42501'; end if;
 if jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'bad patch' using errcode='22023'; end if;
 for part,val in select * from jsonb_each(p_patch) loop
  if part='pd' then
   if jsonb_typeof(val)<>'string' or char_length(val#>>'{}')>40 then raise exception 'bad pd' using errcode='22023'; end if;
  elsif part in ('conditions','checks','roster','report') then
   if jsonb_typeof(val)<>'object' or (select count(*) from jsonb_object_keys(val))>300 then raise exception 'bad %',part using errcode='22023'; end if;
   for k in select jsonb_object_keys(val) loop
    if k !~ '^[A-Za-z0-9_]{1,40}$' then raise exception 'bad key' using errcode='22023'; end if;
    if part in ('conditions','checks') and jsonb_typeof(val->k)<>'boolean' then raise exception 'bad %',part using errcode='22023'; end if;
    if part in ('roster','report') and (jsonb_typeof(val->k)<>'string' or char_length(val->>k)>1000) then raise exception 'bad %',part using errcode='22023'; end if;
   end loop;
  else raise exception 'bad patch' using errcode='22023'; end if;
 end loop;

 select t.version,t.content into v,tpl from report.pd_templates t where t.service_key=p_service order by t.version desc limit 1;
 if v is null then raise exception 'unknown service' using errcode='22023'; end if;
 insert into report.pd_runs(service_key,run_date,template_version,conditions,updated_by)
 values(p_service,p_date,v,report.pd_default_conditions(tpl,p_date),auth.uid())
 on conflict(service_key,run_date) do nothing;

 update report.pd_runs set
  pd_name=coalesce(btrim(p_patch->>'pd'),pd_name),
  conditions=conditions||coalesce(p_patch->'conditions','{}'::jsonb),
  checks=(select coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb) from jsonb_each(checks||coalesce(p_patch->'checks','{}'::jsonb)) e where e.value='true'::jsonb),
  roster=(select coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb) from jsonb_each(roster||coalesce(p_patch->'roster','{}'::jsonb)) e where e.value<>'""'::jsonb),
  report=(select coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb) from jsonb_each(report||coalesce(p_patch->'report','{}'::jsonb)) e where e.value<>'""'::jsonb),
  updated_at=now(),updated_by=auth.uid()
 where service_key=p_service and run_date=p_date
 returning * into r;
 if octet_length(r.checks::text)+octet_length(r.roster::text)+octet_length(r.report::text)>60000 then raise exception 'run too large' using errcode='22023'; end if;
 return r;
end $$;
revoke all on function report.pd_run_save(text,date,jsonb) from public,anon;
grant execute on function report.pd_run_save(text,date,jsonb) to authenticated;

-- 초기화: 'checks'는 체크만, 'all'은 PD·담당자·리포트·조건까지 처음 상태로. 템플릿 버전도 최신으로 맞춘다.
create function report.pd_run_reset(p_service text, p_date date, p_scope text) returns report.pd_runs
language plpgsql security definer set search_path='' as $$
declare v int; tpl jsonb; r report.pd_runs;
begin
 if not report.is_active_user() then raise exception 'active user required' using errcode='42501'; end if;
 if p_scope not in ('checks','all') then raise exception 'bad scope' using errcode='22023'; end if;
 if p_scope='checks' then
  update report.pd_runs set checks='{}',updated_at=now(),updated_by=auth.uid() where service_key=p_service and run_date=p_date returning * into r;
 else
  select t.version,t.content into v,tpl from report.pd_templates t where t.service_key=p_service order by t.version desc limit 1;
  update report.pd_runs set template_version=v,pd_name='',conditions=report.pd_default_conditions(tpl,p_date),checks='{}',roster='{}',report='{}',updated_at=now(),updated_by=auth.uid()
  where service_key=p_service and run_date=p_date returning * into r;
 end if;
 return r;
end $$;
revoke all on function report.pd_run_reset(text,date,text) from public,anon;
grant execute on function report.pd_run_reset(text,date,text) to authenticated;
revoke all on function report.pd_default_conditions(jsonb,date) from public,anon;

-- 주일 1부 템플릿 v1 (docs/pd-checklist/tlc-pd-checklist-data.json, 2026-11-06). 2·3부·라이프라인은 담당 PD 확인 후 추가한다.
insert into report.pd_templates(service_key,version,content) values('sun1',1,$pd${"id":"sun1","name":"주일 1부","start":"08:20","flowType":"sunday","handoverTo":"2부 PD","page1":{"title":"예배 시작 전","rows":[[{"id":"blk_0720","offsetMin":-60,"label":"T-60","title":"전체 상황","style":"default","arrivals":[{"offsetMin":-60,"text":"예배팀 · 음향팀 기도","place":"대예배실"},{"offsetMin":-50,"text":"영상 · 사진 · 조명팀 기도","place":"중계실"}],"items":[{"type":"check","id":"a1","text":"오늘 예배 순서·특이사항 확인"},{"type":"check","id":"a2","text":"헌금 메시지 인도자 확인"},{"type":"check","id":"a3","text":"말씀 합독위원 확인"},{"type":"check","id":"a4","text":"특별순서·특별영상 유무"},{"type":"check","id":"a5","text":"변경사항 전체 공유 여부","condition":"changes"},{"type":"check","id":"a6","text":"층별 TV 전원·입력"},{"type":"check","id":"a7","text":"예배팀·음향팀 기도 시작"},{"type":"check","id":"a8","text":"성전 전체 공조 ON","emphasis":"highlight"}]},{"id":"blk_0735","offsetMin":-45,"label":"T-45","title":"콘텐츠","style":"default","items":[{"type":"check","id":"b1","text":"영상소식 테스트","teams":["자막","영상","음향"],"condition":"news"},{"type":"check","id":"b2","text":"특별영상·음원 확인"},{"type":"check","id":"b3","text":"성찬 순서·자막","condition":"communion"},{"type":"check","id":"b4","text":"말씀 합독 본문 확인","teams":["자막"]},{"type":"check","id":"b5","text":"설교 제목·본문 확인"},{"type":"check","id":"b6","text":"담당자별 순서 숙지"},{"type":"note","parts":[{"text":"기준 ","bold":true},{"text":"파일 있음 ✕ → ","bold":false},{"text":"최종본 + 실제 재생","bold":true}]}]},{"id":"blk_0750","offsetMin":-30,"label":"T-30","title":"시스템 · 도착","style":"default","arrivals":[{"offsetMin":-25,"text":"예배팀 개인 준비"},{"offsetMin":-20,"text":"부산 ATEM 점검 · 안내위원 집결"}],"items":[{"type":"heading","text":"각 파트 이상 유무"},{"type":"checkGroup","layout":"auto","columns":null,"items":[{"id":"c1","text":"음향"},{"id":"c2","text":"자막"},{"id":"c3","text":"영상"},{"id":"c4","text":"사진"},{"id":"c5","text":"조명"},{"id":"c6","text":"스트리밍"},{"id":"c7","text":"부산"}]},{"type":"check","id":"c8","text":"예배팀에 오늘 순서 공지","emphasis":"strong"},{"type":"check","id":"c9","text":"성찬 순서 리마인드","condition":"communion"},{"type":"heading","text":"도착 확인"},{"type":"check","id":"c10","text":"헌금 메시지 인도자"},{"type":"check","id":"c11","text":"말씀 합독위원"}]},{"id":"blk_0800","offsetMin":-20,"label":"부산 ATEM","title":"층별 송출 동시 진행","style":"accent","items":[{"type":"heading","text":"부산 캠퍼스 · 영상팀 + 부산 담당"},{"type":"checkGroup","layout":"columns","columns":2,"items":[{"id":"d1","text":"연결"},{"id":"d2","text":"담당자 연락"},{"id":"d3","text":"영상 수신"},{"id":"d4","text":"음향 수신"}]},{"type":"heading","text":"층별 송출 (동시 진행)"},{"type":"locationMatrix","columns":[{"key":"v","label":"영상"},{"key":"a","label":"음향"}],"rows":[{"id":"d5","label":"1층 라운지"},{"id":"d6","label":"3층 수유실"},{"id":"d7","label":"3층 컨퍼런스룸"}]},{"type":"note","parts":[{"text":"기준 ","bold":true},{"text":"연결 표시 ✕ → ","bold":false},{"text":"실제로 받고 있는가","bold":true}]}]}],[{"id":"blk_0810","offsetMin":-10,"label":"T-10","title":"STANDBY","style":"default","arrivals":[{"offsetMin":-10,"text":"헌금위원 집결 → 바로 확인"}],"items":[{"type":"check","id":"e1","text":"기술팀 인원·장비 STANDBY","emphasis":"strong"},{"type":"check","id":"e2","text":"예배팀 인원·장비 STANDBY","emphasis":"strong"},{"type":"check","id":"e3","text":"헌금 메시지 인도자 STANDBY"},{"type":"check","id":"e4","text":"말씀 합독위원 사운드체크 + 순서 리마인드"},{"type":"check","id":"e5","text":"성찬 준비 상태","condition":"communion"},{"type":"check","id":"e6","text":"안내위원 STANDBY"}]},{"id":"blk_0815","offsetMin":-5,"label":"T-5","title":"FINAL","style":"default","items":[{"type":"checkGroup","layout":"columns","columns":2,"items":[{"id":"f1","text":"라이브 송출"},{"id":"f2","text":"첫 자막"},{"id":"f3","text":"첫 조명"},{"id":"f4","text":"첫 카메라"}]},{"type":"check","id":"f5","text":"카운트다운 첫 화면"},{"type":"check","id":"f6","text":"순서 변경사항 최종 반영"},{"type":"heading","text":"PD FINAL"},{"type":"check","id":"f7","text":"지금 바로 시작할 수 있는가?","emphasis":"strong"},{"type":"check","id":"f8","text":"첫 순서(찬양과 경배)에 공백 없음?","emphasis":"strong"},{"type":"check","id":"f9","text":"다음 순서 담당자 준비?","emphasis":"strong"}]},{"id":"blk_0818","offsetMin":-2,"label":"T-2","title":"COUNTDOWN","style":"cue","items":[{"type":"check","id":"g1","text":"예배팀 등단","emphasis":"strong"},{"type":"check","id":"g2","text":"2분 전 카운트다운 확인"},{"type":"check","id":"g3","text":"전체 팀에 2분 전 큐"}]},{"id":"blk_0819","offsetMin":-1,"label":"T-1","title":"LIVE","style":"cue","items":[{"type":"heading","text":"유튜브 LIVE 시작 확인"},{"type":"check","id":"h1","text":"중계실","emphasis":"strong"},{"type":"check","id":"h2","text":"모바일","emphasis":"strong"}]},{"id":"blk_0820","offsetMin":0,"label":"START","title":"","style":"go","items":[{"type":"check","id":"i1","text":"정시 START","emphasis":"strong"},{"type":"check","id":"i2","text":"찬양과 경배 정상 진행"},{"type":"check","id":"i3","text":"음향·영상·자막"},{"type":"check","id":"i4","text":"조명·방송"}]}]]},"page2":{"title":"예배 진행 · 종료","banner":"현재 순서를 보면서 다음 순서를 준비합니다","flow":[{"id":"s1","label":"COUNTDOWN","style":"countdown","next":"예배팀 등단","offsetMin":-2},{"id":"s2","label":"유튜브 LIVE","style":"liveStart","next":"중계실·모바일 확인","offsetMin":-1},{"id":"s3","label":"START","style":"start","next":"찬양 자막·조명","offsetMin":0},{"id":"s4","label":"찬양과 경배","style":"default","next":"마지막 곡 → 영상소식 전환 준비","sub":"20분","subWhen":{"communion":"15분"}},{"id":"s5","label":"영상소식","style":"default","next":"헌금 메시지 인도자","condition":"news"},{"id":"s6","label":"헌금 메시지","style":"default","next":"헌금위원"},{"id":"s7","label":"헌금","style":"default","next":"성찬·합독 대기","flag":"공조 OFF"},{"id":"s8","label":"성찬","style":"optional","next":"말씀 합독위원","sub":"1주차","condition":"communion"},{"id":"s9","label":"말씀 합독","style":"default","next":"설교자 마이크"},{"id":"s10","label":"설교","style":"default","next":"마침 기도"},{"id":"s11","label":"마침 기도","style":"default","next":"LIVE 종료 큐"},{"id":"s12","label":"유튜브 LIVE 종료","style":"liveEnd","next":"MP3 준비"},{"id":"s13","label":"MP3 전환","style":"end","next":"녹화 저장 확인"}],"roster":[{"group":"순서","sub":"진행 담당","fields":[{"id":"r1","label":"예배 인도자","span":1,"multiple":false},{"id":"r2","label":"설교자","span":1,"multiple":false},{"id":"r3","label":"헌금 메시지 인도자","span":1,"multiple":false},{"id":"r4","label":"말씀 합독위원","span":1,"multiple":false},{"id":"r5","label":"담당 교역자","span":1,"multiple":false},{"id":"r6","label":"성찬 담당 (1주차)","span":1,"multiple":false}]},{"group":"예배위원","sub":"","fields":[{"id":"r7","label":"헌금위원","span":3,"multiple":true},{"id":"r8","label":"안내위원","span":3,"multiple":true}]},{"group":"예배팀","sub":"싱어 · 연주","fields":[{"id":"r9","label":"싱어 · 연주","span":6,"multiple":true}]},{"group":"기술팀","sub":"","fields":[{"id":"r10","label":"음향팀","span":1,"multiple":false},{"id":"r11","label":"영상팀","span":1,"multiple":false},{"id":"r12","label":"사진팀","span":1,"multiple":false},{"id":"r13","label":"자막팀","span":1,"multiple":false},{"id":"r14","label":"조명팀","span":1,"multiple":false},{"id":"r15","label":"부산 담당","span":1,"multiple":false}]}],"during":{"title":"예배 진행 중","items":[{"type":"check","id":"j1","text":"현재 순서 정상 진행"},{"type":"check","id":"j2","text":"다음 순서 담당자 대기","emphasis":"strong"},{"type":"check","id":"j3","text":"마지막 곡 때 영상소식 순서 준비","condition":"news"},{"type":"check","id":"j4","text":"모든 기술팀 영상소식 전환 준비","condition":"news"},{"type":"check","id":"j5","text":"헌금 진행 시 성전 전체 공조 OFF","emphasis":"highlight"},{"type":"check","id":"j6","text":"예배 진행 시간 확인"}]},"after":{"title":"예배 종료 후","items":[{"type":"check","id":"k1","text":"라이브 방송 종료 확인"},{"type":"check","id":"k2","text":"각 팀 녹화·녹음 이상 여부 확인 → 이슈 리포트 공지"},{"type":"check","id":"k3","text":"MP3 전환 확인"},{"type":"check","id":"k4","text":"성전 전체 공조 ON","emphasis":"highlight"},{"type":"check","id":"k5","text":"문제사항 기록"},{"type":"check","id":"k6","text":"2부 PD에게 인수인계","emphasis":"strong"}]},"report":{"title":"PD REPORT","categories":[{"id":"q1","text":"기술"},{"id":"q2","text":"진행"},{"id":"q3","text":"콘텐츠"},{"id":"q4","text":"인원·배치"},{"id":"q5","text":"층별 송출"},{"id":"q6","text":"부산 송출"},{"id":"q7","text":"다음 예배 전 재확인"}],"fields":[{"id":"w_issue","label":"문제 유무","type":"choice","options":["없음","있음"]},{"id":"w3","label":"내용","type":"text","placeholder":"어떤 문제가 있었는지"},{"id":"w4","label":"현장 처리","type":"text","placeholder":"어떻게 처리했는지"},{"id":"w_follow","label":"추가 조치","type":"choice","options":["불필요","필요"]},{"id":"w7","label":"담당자","type":"text","placeholder":"후속 조치 담당"},{"id":"w8","label":"다음 예배 전","type":"text","placeholder":"재확인 사항"}]}},"conditions":[{"id":"communion","label":"성찬주간 (1주차)","tag":"성찬주간","default":false,"autoRule":"예배 날짜가 1~7일이면 켜짐 (수동 변경 가능)"},{"id":"news","label":"영상소식 있음","tag":"영상소식 있을 때","default":true},{"id":"changes","label":"변경사항 있음","tag":"변경 시","default":false}],"teams":["음향","영상","자막","사진","조명","부산"]}$pd$::jsonb) on conflict do nothing;
