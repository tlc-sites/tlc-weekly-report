import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {SUPABASE_STUB} from './stub.mjs';
import {groupDisplayName} from '../src/lib/group-display.ts';
import {stripTypeScriptTypes} from 'node:module';
const formSource=stripTypeScriptTypes(readFileSync('src/lib/report-forms.ts','utf8').replace('"zod"',JSON.stringify(import.meta.resolve('zod'))).replace('"./members"',JSON.stringify(new URL('../src/lib/members.ts',import.meta.url).href)));
const {campusPayload,missingOnSubmit,CAMPUS_SECTIONS}=await import('data:text/javascript;base64,'+Buffer.from(formSource).toString('base64'));
test('새 팀·담당 교역자 명단·3시간 유예/2시간 재알림/제출 중단',async()=>{
 const db=new PGlite();try{
 await db.exec(SUPABASE_STUB);const files=readdirSync('supabase/migrations').sort();for(const f of files.filter(f=>f<'20261104000000'))await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
 await db.exec(readFileSync('supabase/seed.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20261104000000_meeting_deadlines_directory.sql','utf8'));
 assert.equal((await db.query("select count(*)::int n from report.groups where name in('안내팀','송번역팀')")).rows[0].n,2);
 const gid=(await db.query("select id from report.groups where name='음향팀'")).rows[0].id;
 const ids={};for(const n of ['writer','minister','other','senior','admin','lead']){ids[n]=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[ids[n],n+'@example.com']);await db.query("insert into report.profiles(id,real_name,status,is_admin,is_minister,recipient_role,notify_enabled) values($1,$2,'active',$3,$4,$5,true)",[ids[n],n,n==='admin',['minister','other'].includes(n),n==='senior'?'pastor':null]);}
 await db.query("insert into report.memberships(user_id,group_id,role,position) values($1,$4,'writer','오퍼레이터'),($2,$4,'reviewer','담당교역자'),($3,$4,'reviewer',null)",[ids.writer,ids.minister,ids.lead,gid]);
 async function as(n,sql,args=[]){return db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[ids[n]]);return tx.query(sql,args);});}
 const member=(await as('minister',"insert into report.team_directory(group_id,name,duty,created_by) values($1,'계정 없는 팀원','보조',$2) returning id",[gid,ids.minister])).rows[0].id;
 for(const n of ['writer','lead','other','admin'])await assert.rejects(as(n,"insert into report.team_directory(group_id,name,created_by) values($1,'무단',$2)",[gid,ids[n]]),/row-level/);
 await as('minister','update report.team_directory set is_active=false where id=$1',[member]);
 assert.equal((await db.query('select count(*)::int n from report.memberships')).rows[0].n,3,'명단은 권한을 부여하지 않는다');
 await db.exec('update report.meeting_deadline_schedules set is_active=false');
 const meetingDate=(await db.query("select to_char((now() at time zone 'Asia/Seoul')::date-1,'YYYY-MM-DD') d")).rows[0].d;
 await as('minister',"insert into report.meeting_deadline_schedules(group_id,label,weekday,end_time,enabled_at) values($1,'부서 모임',extract(dow from (now() at time zone 'Asia/Seoul')::date-1)::int,'10:20',now()-interval '2 days')",[gid]);
 const at=t=>meetingDate+'T'+t+':00+09:00';
 assert.equal((await db.query('select * from report.claim_meeting_reminders($1)',[at('13:19')])).rows.length,0,'종료 2시간59분에는 발송하지 않는다');
 const first=(await db.query('select * from report.claim_meeting_reminders($1)',[at('13:20')])).rows;
 assert.deepEqual(new Set(first.map(r=>r.user_id)),new Set([ids.writer,ids.minister,ids.senior]));
 assert.equal((await db.query('select * from report.claim_meeting_reminders($1)',[at('13:20')])).rows.length,0,'동시/중복 호출 중복 방지');
 await assert.rejects(as('writer','select * from report.claim_meeting_reminders()'),/permission denied/);
 await db.query("insert into report.reports(group_id,author_id,author_name,meeting_date,meeting_label,status) values($1,$2,'작성자',(now() at time zone 'Asia/Seoul')::date-1,'부서 모임','submitted')",[gid,ids.writer]);
 assert.equal((await db.query('select * from report.claim_meeting_reminders($1)',[at('15:19')])).rows.length,0,'2시간 전에는 반복하지 않는다');
 const second=(await db.query('select * from report.claim_meeting_reminders($1)',[at('15:20')])).rows;
 assert.deepEqual(new Set(second.map(r=>r.user_id)),new Set([ids.minister,ids.senior]),'2시간 뒤 미제출자와 두 분에게 반복');
 assert.ok(!second.some(r=>r.user_id===ids.writer),'제출자는 즉시 중단');
 await db.query("insert into report.reports(group_id,author_id,author_name,meeting_date,meeting_label,status) values($1,$2,'교역자',(now() at time zone 'Asia/Seoul')::date-1,'부서 모임','submitted')",[gid,ids.minister]);
 assert.equal((await db.query('select * from report.claim_meeting_reminders($1)',[at('17:20')])).rows.length,0,'모두 제출하면 두 분 알림도 중단');
 }finally{await db.close();}
});
test('교회학교 표시와 부산 8개 토글은 기존 데이터 키와 분리',()=>{
 assert.equal(groupDisplayName('영유아부',2026),'영·유아부 (26~22년생)');assert.equal(groupDisplayName('중등부',2026),'중등부 (13~08년생)');assert.equal(groupDisplayName('고등부',2026),'고등부 (13~08년생)');
 assert.deepEqual(CAMPUS_SECTIONS.map(s=>s[1]),['예배','장년부','청년부','교회학교','오벧에돔','새가족 현황','웰컴팀','새가족 교육']);
 assert.ok(campusPayload.shape.details.shape.sections);
 assert.ok(missingOnSubmit('campus',{details:{report_mode:'sections',sections:{worship:'사역 내용'}}}).includes('헌금 챙김'));
 assert.ok(missingOnSubmit('campus',{details:{report_mode:'sections',sections:{}}}).length>1);
});

test("교회학교 출생연도는 매년 이동하고 중복 표시하지 않는다",()=>{assert.equal(groupDisplayName("영유아부",2027),"영·유아부 (27~23년생)");assert.equal(groupDisplayName("초등부 (17~16년생)",2027),"초등부 (18~17년생)");});
