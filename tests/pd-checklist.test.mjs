import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {SUPABASE_STUB} from './stub.mjs';
import {applicableCheckIds,progress,clockAt,flowSub,visibleFlow,defaultConditions} from '../src/lib/pd-checklist.ts';

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

test('PD 회차는 승인된 사용자 누구나 칸별로 저장하고 모두가 같은 내용을 본다',async()=>{
 const {db,as}=await setup();try{
 const tpl=(await as('pd',"select version,content from report.pd_templates where service_key='sun1'")).rows;
 assert.equal(tpl.length,1);assert.equal(tpl[0].content.name,'주일 1부');assert.equal(tpl[0].content.conditions.length,3);
 // 첫 저장에서 회차가 생기고, 1~7일 주일이면 성찬주간이 켜진다
 let r=await save(as,'pd','2026-12-06',{pd:'홍길동'});
 assert.equal(r.template_version,1);assert.equal(r.pd_name,'홍길동');
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
 assert.equal(flowSub(tpl.page2.flow[0],off,'08:20'),'08:18');
 assert.deepEqual(visibleFlow(tpl,off).map(s=>s.id).filter(id=>['s5','s8'].includes(id)),[]);
 assert.deepEqual(defaultConditions(tpl,'2026-11-01'),{communion:true,news:true,changes:false});
 assert.deepEqual(defaultConditions(tpl,'2026-11-08'),{communion:false,news:true,changes:false});
});
