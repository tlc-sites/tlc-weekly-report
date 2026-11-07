import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {SUPABASE_STUB} from './stub.mjs';

// DB48: 큐시트·PD 체크리스트 작성자 지정
test('큐시트·PD 작성자: 지정 전에는 누구나, 지정하면 그 사람과 관리자만 고친다',async()=>{const db=new PGlite();try{
 await db.exec(SUPABASE_STUB);
 for(const f of readdirSync('supabase/migrations').sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
 const ids={};
 for(const [n,status,admin] of [['cue','active',false],['pd','active',false],['other','active',false],['admin','active',true],['waiting','pending',false]]){
  ids[n]=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[ids[n],n+'@example.com']);
  await db.query('insert into report.profiles(id,real_name,status,is_admin) values($1,$2,$3,$4)',[ids[n],n,status,admin]);
 }
 const as=(n,sql,args=[])=>db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[ids[n]]);return tx.query(sql,args);});
 const save=(n,patch,date='2026-11-15')=>as(n,"select r.* from report.pd_run_save('sun1',$1,$2) r",[date,JSON.stringify(patch)]).then(x=>x.rows[0]);
 const denied=(p)=>assert.rejects(p,/writer required/);
 const run=()=>db.query("select roster,checks,report,pd_name from report.pd_runs where service_key='sun1' and run_date='2026-11-15'").then(x=>x.rows[0]);

 // 지정 전: 승인된 누구나 회차를 만들고 모든 칸을 고친다
 await save('other',{roster:{r1:'인도자'},checks:{a:true},pd:'아무개'});
 assert.equal((await run()).roster.r1,'인도자');

 // 관리자만 지정·해제한다. 일반 사용자·승인 대기 계정 지정은 안 된다
 await assert.rejects(as('other',"insert into report.worship_doc_roles(user_id,role) values($1,'cue')",[ids.other]),/row-level security/);
 await assert.rejects(as('admin',"insert into report.worship_doc_roles(user_id,role) values($1,'cue')",[ids.waiting]),/row-level security/);
 await as('admin',"insert into report.worship_doc_roles(user_id,role) values($1,'cue'),($2,'pd')",[ids.cue,ids.pd]);
 assert.equal((await as('other','select count(*)::int n from report.worship_doc_roles')).rows[0].n,2);
 const r0=await as('other','select granted_by from report.worship_doc_roles where user_id=$1',[ids.cue]);
 assert.equal(r0.rows[0].granted_by,ids.admin);

 // 지정 뒤: 지정되지 않은 분은 어떤 칸도 못 고치고, 새 회차도 못 만든다
 await denied(save('other',{roster:{r1:'바꿈'}}));
 await denied(save('other',{checks:{b:true}}));
 await denied(save('other',{pd:'바꿈'}));
 await denied(save('other',{roster:{r1:'새'}},'2026-11-22'));
 await denied(as('other',"select report.pd_run_reset('sun1','2026-11-15','checks')"));
 // 큐시트 작성자: 겹치는 칸(담당자·PD 이름·조건)은 되고, 체크·리포트는 안 된다
 await save('cue',{roster:{r1:'큐에서'},pd:'큐PD',conditions:{communion:true}});
 await denied(save('cue',{checks:{c:true}}));
 await denied(save('cue',{report:{note:'x'}}));
 // PD 작성자·관리자: 모두 된다
 await save('pd',{checks:{c:true},report:{note:'메모'},roster:{r2:'PD에서'}});
 await as('pd',"select report.pd_run_reset('sun1','2026-11-15','checks')");
 await save('admin',{checks:{d:true},roster:{r1:'관리자'}});
 const r=await run();
 assert.equal(r.roster.r1,'관리자');assert.equal(r.roster.r2,'PD에서');assert.equal(r.pd_name,'큐PD');assert.deepEqual(r.checks,{d:true});
 // 화면용 확인 함수
 assert.deepEqual((await as('cue',"select report.can_write_worship_doc('cue') c,report.can_write_worship_doc('pd') p")).rows[0],{c:true,p:false});
 assert.deepEqual((await as('other',"select report.can_write_worship_doc('cue') c,report.can_write_worship_doc('pd') p")).rows[0],{c:false,p:false});

 // 역할은 그 종류마다 따로: PD 작성자를 모두 해제하면 체크·리포트는 다시 누구나 고친다(큐시트 제한은 유지)
 // 일반 사용자의 해제는 아무것도 지우지 않는다
 await as('other','delete from report.worship_doc_roles where user_id=$1',[ids.pd]);
 assert.equal((await db.query('select count(*)::int n from report.worship_doc_roles')).rows[0].n,2);
 await as('admin',"delete from report.worship_doc_roles where role='pd'");
 await save('other',{checks:{e:true}});
 // 겹치는 칸은 PD 쪽이 열려 있어 누구나 고칠 수 있다(둘 중 하나만 있어도 되는 규칙)
 await save('other',{roster:{r1:'열림'}});
 // 지정된 분이 사용 중지되면 지정이 없는 것으로 본다
 await as('admin',"insert into report.worship_doc_roles(user_id,role) values($1,'pd')",[ids.pd]);
 await db.query("update report.profiles set status='disabled' where id=$1",[ids.pd]);
 await save('other',{checks:{f:true}});
 // 서버·SQL Editor 작업(로그인 없음)은 막지 않는다
 await db.query("update report.pd_runs set checks='{}' where service_key='sun1'");
}finally{await db.close();}});
