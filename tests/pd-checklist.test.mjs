import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {SUPABASE_STUB} from './stub.mjs';
import {applicableCheckIds,progress,clockAt,flowSub,visibleFlow,defaultConditions,cueTime,cueTitle,cueSongKeys,serviceColor,splitNames,serviceNameEn,keepPhrase,peopleFields} from '../src/lib/pd-checklist.ts';
import {parseTemplate} from '../src/lib/pd-template-schema.ts';
import {toFocusLayout,hasFocusLayout} from '../src/lib/pd-focus-layout.ts';
import {effectiveConditions,cueBlanks,flowParts} from '../src/lib/pd-checklist.ts';

async function setup(){
 const db=new PGlite();
 await db.exec(SUPABASE_STUB);
 for(const f of readdirSync('supabase/migrations').sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
 const ids={};
 for(const [n,status,admin] of [['pd','active',false],['other','active',false],['admin','active',true],['waiting','pending',false]]){
  ids[n]=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[ids[n],n+'@example.com']);
  await db.query("insert into report.profiles(id,real_name,status,is_admin) values($1,$2,$3,$4)",[ids[n],n,status,admin]);
 }
 const as=(n,sql,args=[])=>db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[ids[n]]);return tx.query(sql,args);});
 return {db,ids,as};
}
const save=(as,n,date,patch)=>as(n,'select r.* from report.pd_run_save($1,$2,$3) r',['sun1',date,JSON.stringify(patch)]).then(x=>x.rows[0]);
// 마이그레이션이 템플릿 버전을 더할 수 있으니 버전 번호는 그때그때 최신 값을 읽어 비교한다.
const latestV=(as,svc)=>as('pd','select max(version) v from report.pd_templates where service_key=$1',[svc]).then(x=>x.rows[0].v);

test('PD 회차는 승인된 사용자 누구나 칸별로 저장하고 모두가 같은 내용을 본다',async()=>{
 const {db,as}=await setup();try{
 const tpl=(await as('pd',"select version,content from report.pd_templates where service_key='sun1' and version=1")).rows;
 assert.equal(tpl.length,1);assert.equal(tpl[0].content.name,'주일 1부');assert.equal(tpl[0].content.conditions.length,3);
 // 첫 저장에서 회차가 생기고, 1~7일 주일이면 성찬주간이 켜진다
 let r=await save(as,'pd','2026-12-06',{pd:'홍길동'});
 assert.equal(r.template_version,await latestV(as,'sun1'));assert.equal(r.pd_name,'홍길동');
 assert.deepEqual(r.conditions,{communion:true,news:true,changes:false});
 r=await save(as,'pd','2026-11-08',{checks:{a1:true}});
 assert.deepEqual(r.conditions,{communion:false,news:true,changes:false});
 // 다른 사람이 동시에 다른 칸을 눌러도 앞의 체크가 남는다. 해제한 체크는 지운다.
 await save(as,'other','2026-11-08',{checks:{a2:true,d5v:true}});
 r=await save(as,'pd','2026-11-08',{checks:{a2:false},roster:{r7:'김OO, 이OO'},report:{w_issue:'있음'},conditions:{news:false}});
 assert.deepEqual(r.checks,{a1:true,d5v:true});
 assert.deepEqual(r.roster,{r7:'김OO, 이OO'});assert.equal(r.conditions.news,false);
 // 빈 글은 지운다
 r=await save(as,'other','2026-11-08',{roster:{r7:''}});
 assert.deepEqual(r.roster,{});
 assert.equal((await as('admin',"select checks from report.pd_runs where run_date='2026-11-08'")).rows[0].checks.a1,true);
 // 초기화
 r=(await as('other',"select r.* from report.pd_run_reset('sun1','2026-11-08','checks') r")).rows[0];
 assert.deepEqual(r.checks,{});assert.equal(r.report.w_issue,'있음');
 r=(await as('other',"select r.* from report.pd_run_reset('sun1','2026-11-08','all') r")).rows[0];
 assert.deepEqual([r.pd_name,r.report,r.conditions.news],['',{},true]);
 // 승인 전 사용자는 읽지도 쓰지도 못한다
 await assert.rejects(save(as,'waiting','2026-11-08',{pd:'x'}),/active user required/);
 assert.equal((await as('waiting','select * from report.pd_runs')).rows.length,0);
 assert.equal((await as('waiting','select * from report.pd_templates')).rows.length,0);
 // 직접 쓰기는 막혀 있다(함수로만)
 await assert.rejects(as('admin',"update report.pd_runs set pd_name='x'"),/permission denied/);
 await assert.rejects(as('admin',"insert into report.pd_templates(service_key,version,content) values('sun1',2,'{}')"),/permission denied/);
 // 잘못된 입력
 await assert.rejects(save(as,'pd','2026-11-09',{pd:'월요일'}),/check/);
 await assert.rejects(save(as,'pd','2026-11-08',{checks:{a1:'yes'}}),/bad checks/);
 await assert.rejects(save(as,'pd','2026-11-08',{roster:{'r1; drop':'x'}}),/bad key/);
 await assert.rejects(save(as,'pd','2026-11-08',{other:{}}),/bad patch/);
 await assert.rejects(as('pd',"select report.pd_run_save('sun9','2026-11-08','{}')"),/unknown service/);
 await assert.rejects(save(as,'pd','2026-11-08',{report:{w3:'가'.repeat(1001)}}),/bad report/);
 }finally{await db.close();}
});

test('진행률은 켜진 조건의 항목만 세고 PD REPORT는 뺀다',()=>{
 const data=JSON.parse(readFileSync('docs/pd-checklist/tlc-pd-checklist-data.json','utf8'));
 const tpl={...data.services[0],conditions:data.conditions,teams:data.teams};
 const off={communion:false,news:false,changes:false},on={communion:true,news:true,changes:true};
 const all=applicableCheckIds(tpl,on),few=applicableCheckIds(tpl,off);
 assert.ok(all.includes('d5v')&&all.includes('d7a')&&all.includes('s8')&&all.includes('b3'));
 assert.ok(!few.includes('b3')&&!few.includes('s8')&&!few.includes('s5')&&!few.includes('j3')&&!few.includes('a5'));
 assert.ok(!all.some(id=>/^q\d/.test(id)),'리포트 분류는 진행률에서 뺀다');
 assert.equal(new Set(all).size,all.length,'체크 ID는 고유');
 assert.deepEqual(progress(tpl,off,{a1:true,b3:true,q1:true}),{done:1,total:few.length});
 assert.equal(clockAt('08:20',-60),'07:20');assert.equal(clockAt('00:10',-20),'23:50');
 const worship=tpl.page2.flow.find(s=>s.id==='s4');
 assert.equal(flowSub(worship,off,'08:20'),'20분');assert.equal(flowSub(worship,on,'08:20'),'15분');
 assert.equal(flowSub(tpl.page2.flow[0],off,'08:20'),'08:18');assert.equal(flowSub(tpl.page2.flow[0],off,'13:00'),'12:58');
 // 인쇄 명단: 이름과 (악기)는 한 덩어리, 줄은 쉼표 뒤에서만
 const nm=x=>splitNames(x).map(l=>l.map(it=>it.sep+'|'+it.text.replace(/\u00a0/g,'_'))); assert.deepEqual(nm("김소은 (건반) / 안경용 (베이스) 송재혁 (일렉)"),[["|김소은_(건반)","/|안경용_(베이스)","|송재혁_(일렉)"]]); assert.deepEqual(nm("건반 김OO,드럼 박OO; 베이스 이OO"),[["|건반_김OO,","|드럼_박OO;","|베이스_이OO"]]); assert.deepEqual(nm("소프라노 김OO\n알토 박OO · 테너 최OO"),[["|소프라노_김OO"],["|알토_박OO","·|테너_최OO"]]); assert.deepEqual(["1st.","2nd.","3rd.","LIFELINE"].map(serviceNameEn),["1st Service","2nd Service","3rd Service","Lifeline"]);
 assert.equal(keepPhrase("고치시고 용서하신 예수님 (마태복음 9:1-8)"),"고치시고 용서하신 예수님\u00a0(마태복음\u00a09:1\u20118)");
 assert.deepEqual(visibleFlow(tpl,off).map(s=>s.id).filter(id=>['s5','s8'].includes(id)),[]);
 assert.deepEqual(defaultConditions(tpl,'2026-11-01'),{communion:true,news:true,changes:false});
 assert.deepEqual(defaultConditions(tpl,'2026-11-08'),{communion:false,news:true,changes:false});
});

test('2·3부·라이프라인 템플릿이 있고 1부는 v2에서 T-5가 빠진다',async()=>{
 const {db,as}=await setup();try{
 const rows=(await as('pd',"select distinct on (service_key) service_key,version,content from report.pd_templates order by service_key,version desc")).rows;
 const by=Object.fromEntries(rows.map(r=>[r.service_key,r]));
 assert.deepEqual(Object.fromEntries(rows.map(r=>[r.service_key,[r.version,r.content.name,r.content.start]])),
  {life:[await latestV(as,'life'),'라이프라인','18:00'],sun1:[await latestV(as,'sun1'),'주일 1부','08:20'],sun2:[await latestV(as,'sun2'),'주일 2부','10:40'],sun3:[await latestV(as,'sun3'),'주일 3부','13:00']});
 const labels=t=>t.page1.rows.flat().map(b=>b.label);
 assert.ok(!labels(by.sun1.content).includes('T-5'));
 assert.deepEqual(labels(by.sun2.content),['섬기는 사람','T-60','T-30','T-20','T-10','T-2','T-1','START']);
 // 시작 시각 기준 시각: 2부 예배팀 기도 9:50, 영상팀 10:10, 안내위원 10:20, 전체 집결 10:30 / 3부는 2시간 20분 뒤
 const arr=t=>t.page1.rows.flat().flatMap(b=>(b.arrivals??[]).map(a=>clockAt(t.start,a.offsetMin)+' '+a.text));
 assert.deepEqual(arr(by.sun2.content),['09:50 예배팀 기도 시작','10:10 영상 · 사진 · 조명팀 집결 · 기도','10:20 안내위원 집결','10:30 전체 집결 상태 확인']);
 assert.deepEqual(arr(by.sun3.content).map(s=>s.slice(0,5)),['12:10','12:30','12:40','12:50']);
 assert.ok(by.sun3.content.page2.after.items.some(i=>i.text==='라이프라인 PD에게 인수인계'));
 // 새 회차는 최신 버전으로 만든다. 라이프라인은 변경사항 조건만 있다
 let r=await save(as,'pd','2026-11-08',{pd:'가'});assert.equal(r.template_version,await latestV(as,'sun1'));
 r=(await as('pd',"select r.* from report.pd_run_save('life','2026-12-06','{}') r")).rows[0];
 assert.deepEqual([r.template_version,r.conditions],[await latestV(as,'life'),{changes:false}]);
 r=(await as('pd',"select r.* from report.pd_run_save('sun3','2026-12-06','{}') r")).rows[0];
 assert.deepEqual(r.conditions,{communion:true,news:true,changes:false});
 // 진행률 계산이 새 템플릿에서도 고유 ID로 동작
 for(const {content:t} of rows){const ids=applicableCheckIds(t,{communion:true,news:true,changes:true});assert.equal(new Set(ids).size,ids.length,t.id);}
 }finally{await db.close();}
});

test('관리자만 템플릿을 새 버전으로 저장하고, 동시에 고치면 뒤의 저장은 막힌다',async()=>{
 const {db,as}=await setup();try{
 const cur=(await as('admin',"select content from report.pd_templates where service_key='sun2' order by version desc limit 1")).rows[0].content;
 const b=await latestV(as,'sun2');
 const tpl=JSON.stringify({...cur,name:'주일 2부 (수정)'});
 const saveT=(n,svc,base,c=tpl)=>as(n,'select report.pd_template_save($1,$2,$3) v',[svc,base,c]).then(x=>x.rows[0].v);
 await assert.rejects(saveT('pd','sun2',1),/admin required/);
 await assert.rejects(saveT('waiting','sun2',1),/admin required/);
 assert.equal(await saveT('admin','sun2',b),b+1);
 // 같은 버전을 보고 고친 두 번째 저장은 충돌
 await assert.rejects(saveT('admin','sun2',b),/version conflict/);
 const row=(await as('pd',"select version,content->>'name' nm,content->>'id' id,created_by is not null by from report.pd_templates where service_key='sun2' order by version desc limit 1")).rows[0];
 assert.deepEqual([row.version,row.nm,row.id,row.by],[b+1,'주일 2부 (수정)','sun2',true]);
 // 새 예배(복제)는 base 0으로 v1. 이미 있는 예배에 base 0이면 충돌
 assert.equal(await saveT('admin','sfri',0,JSON.stringify({...cur,name:'금요예배',start:'20:00'})),1);
 await assert.rejects(saveT('admin','sun2',0),/version conflict/);
 let r=(await as('pd',"select r.* from report.pd_run_save('sfri','2026-12-06','{}') r")).rows[0];
 assert.equal(r.template_version,1);
 // 뼈대가 없는 내용·잘못된 키
 await assert.rejects(saveT('admin','sun2',b+1,JSON.stringify({name:'x'})),/bad template/);
 await assert.rejects(saveT('admin','sun2',b+1,JSON.stringify({...cur,start:'25:00'})),/bad template/);
 await assert.rejects(saveT('admin','Bad-Key',0),/bad service/);
 await assert.rejects(as('admin',"insert into report.pd_templates(service_key,version,content) values('sun2',9,'{}')"),/permission denied/);
 // 오늘(한국 시간)·앞으로의 회차는 템플릿을 저장하면 바로 최신 버전을 따른다. 지난 회차는 기록할 때의 버전으로 남는다.
 const today=(await db.query("select (now() at time zone 'Asia/Seoul')::date::text d")).rows[0].d;
 const next=(await db.query("select (d+((7-extract(dow from d)::int)%7))::text s from (select (now() at time zone 'Asia/Seoul')::date d) x")).rows[0].s;
 const past=(await db.query("select (d-7-extract(dow from d)::int)::text s from (select (now() at time zone 'Asia/Seoul')::date d) x")).rows[0].s;
 assert.ok(next>=today&&past<today);
 for(const d of [next,past])await as('pd','select report.pd_run_save($1,$2,$3)',['sun2',d,JSON.stringify({checks:{a1:true},roster:{r1:'가'}})]);
 const ver=async d=>(await as('pd','select template_version v,checks,roster from report.pd_runs where service_key=$1 and run_date=$2',['sun2',d])).rows[0];
 assert.equal((await ver(next)).v,b+1);assert.equal((await ver(past)).v,b+1);
 assert.equal(await saveT('admin','sun2',b+1,JSON.stringify({...cur,name:'다음'})),b+2);
 const n=await ver(next);assert.deepEqual([n.v,n.checks,n.roster],[b+2,{a1:true},{r1:'가'}]);
 assert.equal((await ver(past)).v,b+1);
 // 지난 회차에 적어도 버전은 그대로, 전체 초기화하면 최신으로
 r=(await as('pd','select r.* from report.pd_run_save($1,$2,$3) r',['sun2',past,'{"pd":"나"}'])).rows[0];assert.equal(r.template_version,b+1);
 r=(await as('pd','select r.* from report.pd_run_reset($1,$2,$3) r',['sun2',past,'all'])).rows[0];assert.equal(r.template_version,b+2);
 }finally{await db.close();}
});

test('템플릿 검사: 지금 템플릿은 통과하고 빈 문구·겹친 ID·없는 조건은 막는다',()=>{
 const {templates}=JSON.parse(readFileSync('docs/pd-checklist/templates-2026-11-06.json','utf8'));
 for(const t of templates){const r=parseTemplate(t);assert.ok(r.ok,t.id+' '+JSON.stringify(r.errors));}
 const t=structuredClone(templates[1]);
 const r1=parseTemplate({...t,name:' '});assert.ok(!r1.ok&&r1.errors[0].startsWith('예배 이름'),JSON.stringify(r1));
 const dup=structuredClone(t);dup.page2.after.items[0].id=dup.page2.during.items[0].id;
 const r2=parseTemplate(dup);assert.ok(!r2.ok&&/겹칩니다/.test(r2.errors[0]));
 const nc=structuredClone(t);nc.page2.after.items[0].condition='nope';
 assert.ok(!parseTemplate(nc).ok);
 const empty=structuredClone(t);empty.page1.rows[0][0].items[0].text='';
 const r3=parseTemplate(empty);assert.ok(!r3.ok&&/^1페이지 › 1줄 1번째 블록 › 항목 1번째 › 문구: 비어 있습니다$/.test(r3.errors[0]),JSON.stringify(r3));
 // 모르는 키는 지운다
 const extra=parseTemplate({...t,hack:1});assert.ok(extra.ok&&!('hack' in extra.data));
});

test('큐시트: 예배별 양식이 새 버전에 들어가고, 큐시트 값과 PD 담당자 칸·송리스트가 같은 키를 쓴다',async()=>{
 const {db,as}=await setup();try{
 const rows=(await as('pd',"select distinct on (service_key) service_key,version,content from report.pd_templates order by service_key,version desc")).rows;
 const by=Object.fromEntries(rows.map(r=>[r.service_key,r.content]));
 assert.deepEqual(rows.map(r=>r.service_key),['life','sun1','sun2','sun3']);
 for(const t of Object.values(by))assert.ok(parseTemplate(t).ok,t.id);
 const s1=by.sun1,life=by.life;
 // 시간표: 1부 08:20 시작, 라이프라인 설교는 끝 시각 없음
 assert.deepEqual(s1.cue.rows.map(r=>cueTime(s1.start,r)),['08:20 - 08:40','08:40 - 08:55','08:40 - 08:55','08:40 - 08:55','08:40 - 08:55','08:55 - 09:00','09:00 - 10:20']);
 // 성찬은 헌금 다음, 같은 시간대, 성찬주간 조건일 때만(담당은 PD 체크리스트 '성찬 담당' r6). 라이프라인에는 없다
 assert.deepEqual(s1.cue.rows.map(r=>r.id).slice(2,5),['offlead','offsong','communion']);assert.deepEqual([s1.cue.rows[4].condition,s1.cue.rows[4].lines[0].key],['communion','r6']);
 // DB50: 순서에서 헌금 줄을 빼고 헌금위원(r7)은 담당으로(안내 다음, PD 앞). DB51: 헌금송은 순서에 다시(헌금인도 다음), 중계 믹싱(r20)은 담당에서 뺀다
 for(const t of Object.values(by)){assert.ok(!t.cue.rows.some(r=>r.id==='offering'),t.id);assert.deepEqual(t.cue.staff.map(x=>x.key).slice(-3),['r8','r7','pd'],t.id);}
 assert.deepEqual(['offlead','offsong'].map(id=>cueTime(life.start,life.cue.rows.find(r=>r.id===id))),['18:50 - 18:55','18:55 - 19:05']);
 for(const t of Object.values(by)){assert.ok(!t.cue.staff.some(x=>x.key==='r20'),t.id);assert.deepEqual(t.cue.rows.find(r=>r.id==='offsong').lines,[{key:'c_offsong'}],t.id);}
 assert.ok(!life.cue.rows.some(r=>r.id==='communion'));
 assert.equal(cueTime(by.sun2.start,by.sun2.cue.rows.at(-1)),'11:20 - 12:40');
 assert.equal(cueTime(life.start,life.cue.rows.at(-1)),'19:05 -');
 // 순서 표 시간은 24시간제
 assert.deepEqual(by.sun3.cue.rows.map(r=>cueTime(by.sun3.start,r)).slice(0,2),['13:00 - 13:20','13:20 - 13:35']);
 assert.equal(cueTitle('2026-11-08',s1.cue.label,s1.start),'2026.11.8 1st. (08:20)');
 assert.equal(cueTitle('2026-11-08',by.sun3.cue.label,by.sun3.start),'2026.11.8 3rd. (13:00)');
 assert.equal(cueTitle('2026-11-08',by.life.cue.label,by.life.start),'2026.11.8 LIFELINE (18:00)');
 assert.deepEqual(s1.cue.staff.map(x=>x.key).slice(3,5),['r10','r11']);
 // DB52: 1부 담당에서 녹음팀(r19)을 뺐다
 for(const t of Object.values(by))assert.ok(!t.cue.staff.some(x=>x.key==='r19'),t.id);
 // DB55: 부산 ATEM 블록은 바로 앞 T-30 블록에 합쳐 '넓게'(두 칸)로, 시스템 점검의 '부산' 칸은 뺀다. 1부엔 마이크·의전 음료·마이크 위치 항목
 for(const t of Object.values(by)){const bl=t.page1.rows.flat();assert.ok(!bl.some(b=>b.label==='부산 ATEM'),t.id);const atem=bl.find(b=>JSON.stringify(b.items).includes('층별 송출'));if(atem){assert.ok(atem.wide&&atem.title.endsWith('부산 ATEM'),t.id);assert.ok(!JSON.stringify(atem.items).includes('"text":"부산"'),t.id);}}
 {const ids=JSON.stringify(s1);for(const k of ['e_mic','e_drink','j_micpos'])assert.ok(ids.includes('"'+k+'"'),k);}assert.equal(by.sun2.cue.staff[4].en,'Video');
 // DB57: 1부 1쪽 맨 위 '섬기는 사람' 표. 이름은 담당자 칸(r1…r8)과 같은 값이라 2쪽 담당자 칸에서는 빠지고(기술팀은 남는다), 흩어진 사람 체크는 표로 옮겼다
 {const pb=s1.page1.rows[0][0];const pp=pb.items[0];assert.deepEqual([pb.label,pb.wide,s1.page1.rows[0].length,pp.type],['섬기는 사람',true,1,'people']);
  assert.deepEqual(pp.people.map(p=>p.field??p.key),['r1','r2','r3','r4','r7','r8','wt']);assert.deepEqual(pp.steps.map(x=>x.label),['확인','도착','STANDBY']);
  const ids=applicableCheckIds(s1,{});assert.ok(ids.includes('pp_r1_ok')&&ids.includes('pp_wt_sb'));for(const k of ['a2','a3','c10','c11','e1','e2','e3','e6','c9','e5'])assert.ok(!ids.includes(k),k);
  assert.equal(JSON.stringify(s1).match(/"id": ?"b3"[^}]*/)[0].includes('성찬 순서·자막·준비'),true);
  const bad=structuredClone(s1);bad.page1.rows[0][0].items[0].people[0].field='nope';assert.ok(!parseTemplate(bad).ok);}
 // DB58: 2부·3부·라이프라인도 같은 표. 라이프라인은 광고(r16)·강대상 옮김(r17)까지, 시각은 가장 이른 블록(T-100). a10·e4는 남는다
 for(const k of ['sun1','sun2','sun3','life']){const t=by[k];const pb=t.page1.rows[0][0];assert.equal(pb.items[0].type,'people',k);assert.equal(t.page1.rows[0].length,1,k);
  assert.ok(parseTemplate(t).ok,k);const ids=applicableCheckIds(t,{});assert.ok(ids.includes('pp_r1_in')&&ids.includes('pp_wt_sb'),k);
  // DB60: 기술팀 한 칸(tech) 대신 바로 아래 '기술팀' 표(음향…부산, 도착·STANDBY 한 줄). 위 표는 '순서·위원'
  const [top,crew]=pb.items;assert.equal(top.caption,'순서·위원',k);assert.ok(!top.people.some(p=>p.key==='tech'),k);
  assert.deepEqual([crew.type,crew.caption,crew.inline,crew.steps.map(x=>x.key).join()],['people','기술팀',true,'in,sb'],k);
  assert.deepEqual(crew.people.map(p=>p.field),['r10','r11','r12','r13','r14','r15'],k);assert.ok(ids.includes('pp_r10_in')&&ids.includes('pp_r15_sb')&&!ids.includes('pp_r10_ok'),k);
  assert.ok(!t.page2.roster.some(g=>g.fields.some(f=>!peopleFields(t).has(f.id)&&!f.id.startsWith('song'))),k);
  for(const x of ['a2','a3','a9','c12','c13','c14','e1','e2','e3','e6','e7','e8'])assert.ok(!ids.includes(x),k+' '+x);for(const x of k==='sun1'?['e4']:['a10','e4'])assert.ok(ids.includes(x),k+' '+x);
  assert.ok(!t.page1.rows.flat().some(b=>b.items.some(i=>i.type==='heading'&&i.text.startsWith('도착'))),k);}
 assert.deepEqual([...peopleFields(by.sun2)],['r1','r2','r3','r4','r7','r8','r10','r11','r12','r13','r14','r15']);
 assert.deepEqual([...peopleFields(by.life)],['r1','r2','r3','r4','r16','r7','r8','r17','r10','r11','r12','r13','r14','r15']);assert.equal(by.life.page1.rows[0][0].offsetMin,-100);
 assert.deepEqual(cueSongKeys(life.cue),['song1','song2','song3','song4','song5','song6','song_off']);
 // 성찬주간이면 헌금 다음에 성찬 곡(song_comm). 큐시트·PD 체크리스트 송리스트에 같이 보인다
 assert.deepEqual(cueSongKeys(s1.cue,{communion:true}).slice(-2),['song_off','song_comm']);assert.ok(!cueSongKeys(s1.cue,{communion:false}).includes('song_comm'));
 assert.ok(!cueSongKeys(life.cue,defaultConditions(life,'2026-12-06')).includes('song_comm'));
 // PD 담당자 칸: 송리스트가 붙는다. 큐시트의 담당 키는 PD 칸이거나 큐시트 전용 키(악기 r18·싱어 r9는 DB53부터 큐시트에서만)
 const fields=t=>t.page2.roster.flatMap(g=>g.fields.map(f=>f.id));
 // PD 담당자 칸에서 담당 교역자(r5)·성찬 담당(r6)은 뺐다(성찬 담당은 큐시트에서만)
 for(const t of Object.values(by))assert.ok(!fields(t).some(k=>k==='r5'||k==='r6'),t.id);
 for(const t of Object.values(by)){assert.ok(!t.page2.roster.some(g=>g.group==='예배팀'),t.id);assert.ok(!fields(t).some(k=>k==='r18'||k==='r9'),t.id);assert.ok(fields(t).includes('r1'),t.id);}
 assert.deepEqual(s1.cue.staff.map(x=>x.key).slice(1,3),['r18','r9']);
 assert.ok(cueSongKeys(s1.cue).every(k=>fields(s1).includes(k)));
 for(const k of ['r1','r10','r11','r13','r14','r8','r2','r3','r4','r7'])assert.ok(fields(s1).includes(k),k);
 // 큐시트에서 쓴 값(PD 이름·영어 값 포함)이 같은 회차에 들어가 PD 체크리스트에서도 보인다
 let r=(await as('other',"select r.* from report.pd_run_save('sun1','2026-11-08',$1) r",[JSON.stringify({pd:'박PD',roster:{r1:'김인도',r1_en:'Kim',song1:'주 은혜임을'}})])).rows[0];
 assert.equal(r.template_version,await latestV(as,'sun1'));assert.equal(r.pd_name,'박PD');assert.deepEqual(r.roster,{r1:'김인도',r1_en:'Kim',song1:'주 은혜임을'});
 }finally{await db.close();}
});

test('예배별 색: 템플릿 색이 있으면 그 색, 없으면 예배 키별 기본색, 잘못된 값은 막는다',()=>{
 assert.equal(serviceColor({id:'sun1'}),'#2b62c4');assert.equal(serviceColor({id:'life'}),'#c03a6b');
 assert.equal(serviceColor({id:'sxyz'}),'#2b62c4');assert.equal(serviceColor({id:'sun2',color:'#2f7d32'}),'#2f7d32');
 assert.equal(serviceColor({id:'sun2',color:'red'}),'#0e7c86');
 const {templates}=JSON.parse(readFileSync('docs/pd-checklist/templates-2026-11-06.json','utf8'));
 assert.ok(parseTemplate({...templates[1],color:'#6a4bc2'}).ok);assert.ok(!parseTemplate({...templates[1],color:'url(x)'}).ok);
});

test('DB61: 이름에 금요가 들어간 예배는 T-30 무렵 블록에 부산 ATEM(주일 1부와 같은 내용)을 붙이고, 다시 돌려도 그대로',async()=>{
 const {db,as}=await setup();try{
 const sql=readFileSync('supabase/migrations/20261221000000_pd_friday_atem.sql','utf8');
 // 편집 화면 복제처럼: 2부(ATEM 없음) 내용으로 금요예배, 이름이 다른 예배는 대상 아님
 const s2=(await db.query("select content from report.pd_templates where service_key='sun2' order by version desc limit 1")).rows[0].content;
 for(const [k,name] of [['fri1','금요예배'],['sat1','토요 기도회']])await db.query('insert into report.pd_templates(service_key,version,content) values($1,1,$2)',[k,JSON.stringify({...s2,id:k,name})]);
 await db.exec(sql);await db.exec(sql);
 const vs=(await db.query("select service_key,max(version) v from report.pd_templates where service_key in('fri1','sat1') group by 1 order by 1")).rows;
 assert.deepEqual(vs.map(x=>[x.service_key,x.v]),[['fri1',2],['sat1',1]]);
 const fri=(await db.query("select content from report.pd_templates where service_key='fri1' and version=2")).rows[0].content;
 assert.ok(parseTemplate(fri).ok);
 const blk=fri.page1.rows.flat().find(b=>JSON.stringify(b.items).includes('부산 캠퍼스'));
 assert.deepEqual([blk.offsetMin,blk.wide,blk.title],[-30,true,'시스템 · 도착 · 부산 ATEM']);
 const ids=applicableCheckIds(fri,{});for(const k of ['d1','d2','d3','d4','d5v','d5a','d7a'])assert.ok(ids.includes(k),k);
 assert.ok(ids.includes('c1'));// 원래 시스템 점검은 남는다
 assert.equal(await latestV(as,'fri1'),2);
 }finally{await db.close();}
});

test('DB62: 관리자는 잘못 만든 예배를 지우고 되살린다. 기본 네 예배·없는 예배는 막고, 다른 사람은 못 하며 기록은 남는다',async()=>{
 const {db,as}=await setup();try{
 const s2=(await db.query("select content from report.pd_templates where service_key='sun2' order by version desc limit 1")).rows[0].content;
 await as('admin','select report.pd_template_save($1,0,$2)',['sabc',JSON.stringify({...s2,name:'금요예배 잘못'})]);
 await as('pd',"select report.pd_run_save('sabc','2026-11-29',$1)",[JSON.stringify({pd:'홍PD'})]);
 const rm=(n,k,b)=>as(n,'select report.pd_service_set_removed($1,$2)',[k,b]);
 await assert.rejects(rm('pd','sabc',true),/admin required/);
 await assert.rejects(rm('admin','sun1',true),/base service/);
 await assert.rejects(rm('admin','nope',true),/no service/);
 await rm('admin','sabc',true);await rm('admin','sabc',true);// 두 번 눌러도 그대로
 const list=n=>as(n,'select service_key from report.pd_service_removed').then(x=>x.rows.map(r=>r.service_key));
 assert.deepEqual(await list('pd'),['sabc']);
 await assert.rejects(as('admin',"insert into report.pd_service_removed(service_key) values('sun2')"),/permission denied/);
 // 템플릿·회차 기록은 그대로
 assert.equal((await db.query("select count(*)::int n from report.pd_templates where service_key='sabc'")).rows[0].n,1);
 assert.equal((await db.query("select pd_name from report.pd_runs where service_key='sabc'")).rows[0].pd_name,'홍PD');
 await rm('admin','sabc',false);assert.deepEqual(await list('pd'),[]);
 }finally{await db.close();}
});

test('새 양식(명단·큐시트 확인·집중 구간): 변환·진행 숫자·큐시트 빈 칸·영상광고 없음', async()=>{
 const {db}=await setup();try{
 const latest=k=>db.query("select content from report.pd_templates where service_key=$1 order by version desc limit 1",[k]).then(x=>x.rows[0].content);
 const s1=await latest('sun1');
 // 운영 1부처럼 '예배 진행 중' 5개
 s1.page2.during.items=[{type:'check',id:'j2',text:'다음 순서 담당자 위치 파악'},{type:'check',id:'j3',text:'마지막 곡 때 영상소식 순서 준비',condition:'news'},{type:'check',id:'j4',text:'모든 기술팀 영상소식 전환 준비',condition:'news'},{type:'check',id:'j5',text:'헌금 진행 시 성전 전체 공조 OFF'},{type:'check',id:'j_micpos',text:'목사님, 사모님 설교 등단 전 마이크 포지션 확인'}];
 const {template:t}=toFocusLayout(s1);
 assert.ok(parseTemplate(t).ok);assert.ok(hasFocusLayout(t));assert.ok(!hasFocusLayout(s1));
 // 1쪽: 체크 없는 세 줄 명단, 예배 인도는 예배팀 줄의 '인도'로만
 const pb=t.page1.rows[0][0];assert.equal(pb.title,'오늘 섬기는 명단');assert.equal(pb.items.length,1);
 const ros=pb.items[0];assert.equal(ros.type,'roster');
 assert.deepEqual(ros.lines.map(l=>[l.label,l.cols.map(c=>c.label+':'+c.field).join()]),[
  ['말씀·위원','설교:r2,헌금 메시지:r3,말씀 합독:r4,헌금위원:r7,안내위원:r8'],
  ['예배팀','인도:r1,악기:r18,싱어:r9'],
  ['기술팀','음향:r10,영상:r11,자막:r13,조명:r14,사진:r12,부산 담당:r15']]);
 // T-45 맨 위 큐시트 확인
 const t45=t.page1.rows.flat().find(b=>b.label==='T-45');assert.equal(t45.items[0].type,'cueCheck');
 // 2쪽: 집중 구간 = 영상소식~말씀 합독(성찬 포함), 끝은 설교. '진행 중'은 모두 옮겨 비었다
 const parts=flowParts(t);
 assert.deepEqual(parts.zone.map(s=>s.label),['영상소식','헌금 메시지','헌금','성찬','말씀 합독']);
 assert.deepEqual([parts.before.map(s=>s.label).join(),parts.end.label,parts.after.map(s=>s.label).join()],['COUNTDOWN,유튜브 LIVE,START,찬양과 경배','설교','설교,마침 기도,유튜브 LIVE 종료,MP3 전환']);
 assert.equal(t.page2.during.items.length,0);assert.equal(t.page2.focus.check.id,'j2');assert.equal(t.page2.focus.endField,'r2');
 const cks=k=>parts.zone.find(s=>s.label===k).focus.checks.map(c=>c.text);
 assert.deepEqual(cks('영상소식'),['마지막 곡 때 영상소식 순서 준비','모든 기술팀 영상소식 전환 준비']);
 assert.deepEqual(cks('헌금 메시지'),['헌금위원 위치 확인']);
 assert.deepEqual(cks('헌금'),['헌금 진행 시 성전 전체 공조 OFF','말씀 합독위원 대기']);
 assert.deepEqual(cks('말씀 합독'),['목사님, 사모님 설교 등단 전 마이크 포지션 확인']);
 assert.deepEqual(parts.zone.map(s=>s.cue??''),['ann','offlead','','','scripture']);
 // 진행 숫자: 섬기는 사람 체크·집중 칸 FLOW 체크는 빠지고, 큐시트 확인·헌금위원 위치·합독위원 대기가 더해진다
 const on={communion:false,news:true,changes:false};
 const before=applicableCheckIds(s1,on),after=applicableCheckIds(t,on);
 const pp=before.filter(x=>x.startsWith('pp_')).length;
 assert.equal(after.length,before.length-pp-4+3);
 assert.ok(!after.some(x=>x.startsWith('pp_'))&&!after.includes('s5')&&after.includes('s4')&&after.includes('j2'));
 // 영상소식 없음: 큐시트 광고에 '영상광고: 없음'이면 꺼진 것으로 보고 영상소식 체크 2개가 빠진다
 const eff=effectiveConditions(t,on,{c_ann:'영상광고: 없음'});assert.equal(eff.news,false);
 assert.equal(applicableCheckIds(t,eff).length,after.length-2-1);// 영상소식 체크 2 + T-45 영상소식 테스트 1
 assert.equal(effectiveConditions(t,on,{c_ann:'영상광고: 성탄 준비'}).news,true);
 // 큐시트 빈 칸: 순서 줄·담당·송리스트
 const full={c_worship:'예배팀',c_ann:'광고',r3:'이흥배',c_offsong:'예배팀',r4:'김충열',r2:'스캇',c_sermon:'제목',r1:'이희준',r18:'김소은',r9:'김연지',r10:'김승희',r11:'홍규화',r14:'문경모',r13:'노재용',r8:'김보영',r7:'김말숙',song1:'a',song2:'b',song3:'c',song4:'d',song_off:'e'};
 assert.deepEqual(cueBlanks(t,full,'홍PD',on),[]);
 const {r2,song3,song4,...miss}=full;void r2;void song3;void song4;
 assert.deepEqual(cueBlanks(t,miss,'',on),['설교자','PD','송리스트 2곡']);
 // 명단·집중 구간은 없는 칸을 가리키면 저장을 막는다
 const bad=structuredClone(t);bad.page1.rows[0][0].items[0].lines[0].cols[0].field='nope';assert.ok(!parseTemplate(bad).ok);
 // 다시 눌러도 그대로(이미 새 양식)
 assert.deepEqual(toFocusLayout(t).template,t);
 // 라이프라인: 찬양 다음 헌금 메시지·헌금, 끝은 설교. 옮기지 못한 '적용 기도' 항목은 진행 중 카드에 남는다
 const lt=toFocusLayout(await latest('life')).template;assert.ok(parseTemplate(lt).ok);
 const lp=flowParts(lt);assert.deepEqual([lp.zone.map(s=>s.label).join(),lp.end.label],['헌금 메시지,헌금','설교']);
 assert.deepEqual(lt.page2.during.items.map(i=>i.text),['적용 기도 첫 기도제목 후 LIVE 종료 큐']);
 }finally{await db.close();}
});
