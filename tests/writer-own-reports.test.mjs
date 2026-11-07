import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {SUPABASE_STUB} from './stub.mjs';

// DB49: 교역자가 아닌 분은 본인이 쓴 보고만 본다. 팀 검토 역할(리더)과 일부러 공유받은 보고는 그대로 본다.
test('교역자가 아닌 작성자는 같은 팀 동료의 보고도 보지 않는다',async()=>{const db=new PGlite();try{
 await db.exec(SUPABASE_STUB);
 for(const f of readdirSync('supabase/migrations').sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
 await db.exec(readFileSync('supabase/seed.sql','utf8'));
 const ids={};
 for(const [n,minister] of [['w1',false],['w2',false],['lead',false],['other',false],['minister',true]]){
  ids[n]=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[ids[n],n+'@example.com']);
  await db.query("insert into report.profiles(id,real_name,status,is_minister) values($1,$2,'active',$3)",[ids[n],n,minister]);
 }
 const gid=async name=>(await db.query('select id from report.groups where name=$1',[name])).rows[0].id;
 const sound=await gid('음향팀'),video=await gid('영상팀');
 await db.query("insert into report.memberships(user_id,group_id,role) values($1,$3,'writer'),($2,$3,'writer'),($4,$3,'reviewer'),($5,$6,'writer')",[ids.w1,ids.w2,sound,ids.lead,ids.other,video]);
 const as=(n,sql,args=[])=>db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[ids[n]]);return tx.query(sql,args);});
 const r=(await as('w1',"insert into report.reports(group_id,author_id,author_name,meeting_date,meeting_label) values($1,$2,'w1',current_date,'수요예배') returning id",[sound,ids.w1])).rows[0].id;
 await db.query("update report.reports set status='submitted' where id=$1",[r]);
 const sees=async n=>(await as(n,'select id from report.reports where id=$1',[r])).rows.length===1;
 assert.equal(await sees('w1'),true,'본인');
 assert.equal(await sees('w2'),false,'같은 팀 작성자');
 assert.equal(await sees('other'),false,'다른 팀 작성자');
 assert.equal(await sees('lead'),true,'팀 리더(검토 역할)');
 assert.equal(await sees('minister'),true,'교역자');
 // 작성자가 고른 '함께 보는 부서'로 공유되면 그 부서 사람은 본다
 await db.query('insert into report.report_mentions(report_id,group_id) values($1,$2)',[r,video]);
 assert.equal(await sees('other'),true,'공유받은 부서');
 assert.equal(await sees('w2'),false,'공유와 무관한 동료는 여전히 못 봄');
}finally{await db.close();}});
