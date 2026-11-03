import {test} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {SUPABASE_STUB} from './stub.mjs';
register('./tsx-loader.mjs',import.meta.url);
const {attendanceLines,isTeamSession,sessionKinds,teamSessionPayload}=await import('../src/lib/team-session.ts');
const {missingOnSubmit}=await import('../src/lib/report-forms.ts');
const {reportSummaryLines}=await import('../src/lib/weekly-summary.ts');

const members=[{name:'김출석',present:true,note:'',follow_up:''},{name:'이결석',present:false,note:'출장',follow_up:''},{name:'박미기재',present:false,note:'',follow_up:''}];
const payload={details:{session_type:'assembly',topic:'',passage:'',place:'본당',content:'11월 전체모임: 연말 예배 준비 논의',members},messages:{pastor:'',pastor_wife:''}};

test('전체모임 보고는 예배/기술팀에서만 고를 수 있다',()=>{
 assert.ok(sessionKinds('worship').includes('assembly'));
 for(const type of ['education','other','campus'])assert.ok(!sessionKinds(type).includes('assembly'));
 assert.ok(isTeamSession({session_type:'assembly'}));
});

test('전체모임 출결 요약과 제출 필수 항목(모임 내용)',()=>{
 assert.deepEqual(attendanceLines(members),['출결: 출석 1명 · 결석 2명','결석: 이결석(출장), 박미기재']);
 assert.deepEqual(attendanceLines([]),[]);
 assert.ok(teamSessionPayload.safeParse(payload).success);
 assert.deepEqual(missingOnSubmit('worship',payload),[]);
 assert.deepEqual(missingOnSubmit('worship',{...payload,details:{...payload.details,content:''}}),['모임 내용']);
 const lines=reportSummaryLines({id:'r',group_id:'g',meeting_date:'2026-11-01',meeting_label:'전체모임 보고',status:'submitted',service:null,details:payload.details});
 assert.ok(lines.includes('출결: 출석 1명 · 결석 2명'));
 assert.ok(lines.some(l=>l.startsWith('진행 내용: 11월 전체모임')));
});

test('예배팀 전체모임 보고를 저장·제출하면 출결과 결석 사유가 그대로 남고 학생 출결 통계는 만들지 않는다',async()=>{const db=new PGlite();try{
 await db.exec(SUPABASE_STUB);for(const f of readdirSync('supabase/migrations').sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));await db.exec(readFileSync('supabase/seed.sql','utf8'));
 const writer=randomUUID();await db.query("insert into auth.users(id,email) values($1,'w@example.com')",[writer]);await db.query("insert into report.profiles(id,real_name,status) values($1,'작성자','active')",[writer]);
 const team=(await db.query("select id from report.groups where name='예배팀'")).rows[0].id;
 await db.query("insert into report.memberships(user_id,group_id,role,position) values($1,$2,'writer','예배인도자')",[writer,team]);
 const as=(sql,args=[])=>db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[writer]);return tx.query(sql,args);});
 const r=(await as("insert into report.reports(group_id,author_id,author_name,meeting_date,meeting_label,details) values($1,$2,'작성자',current_date,'전체모임 보고',$3::jsonb) returning id,updated_at",[team,writer,JSON.stringify({session_type:'assembly',members})])).rows[0];
 const version=(await as('select report.autosave_report($1,$2,$3::jsonb) version',[r.id,r.updated_at,JSON.stringify(payload)])).rows[0].version;
 await as("select report.save_report_from_draft($1,$2::jsonb,'submitted',$3)",[r.id,JSON.stringify(payload),version]);
 const saved=(await as('select status,details,attend_snapshot,enrolled_snapshot from report.reports where id=$1',[r.id])).rows[0];
 assert.equal(saved.status,'submitted');
 assert.equal(saved.details.session_type,'assembly');
 assert.equal(saved.details.content,payload.details.content);
 assert.deepEqual(saved.details.members.map(m=>[m.name,m.present,m.note]),[['김출석',true,''],['이결석',false,'출장'],['박미기재',false,'']]);
 assert.equal(saved.attend_snapshot,null);assert.equal(saved.enrolled_snapshot,null);
 assert.equal((await db.query('select * from report.attendance where report_id=$1',[r.id])).rows.length,0);
}finally{await db.close();}});
