import {test} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {SUPABASE_STUB} from './stub.mjs';
register('./tsx-loader.mjs',import.meta.url);
const {RESULT_LABEL,missingOnSubmit,worshipPayload}=await import('../src/lib/report-forms.ts');
const {reportSummaryLines}=await import('../src/lib/weekly-summary.ts');

const base={details:{result:'other',notes:'',sermon_passage:'',sermon_content:'',requests:[],mentions:[]},issues:[],messages:{pastor:'',pastor_wife:''}};

test('진행 결과 기타: 선택지에 있고, 사역 내용이 있어야 제출된다',()=>{
 assert.equal(RESULT_LABEL.other,'기타');
 const parsed=worshipPayload.safeParse(base);
 assert.ok(parsed.success,JSON.stringify(parsed.error?.issues));
 assert.deepEqual(missingOnSubmit('worship',parsed.data),['사역 내용']);
 const filled=worshipPayload.parse({...base,details:{...base.details,notes:'정전으로 10분 늦게 시작'}});
 assert.deepEqual(missingOnSubmit('worship',filled),[]);
 // 정상은 사역 내용 없이도 제출된다(기존 동작 유지)
 assert.deepEqual(missingOnSubmit('worship',worshipPayload.parse({...base,details:{...base.details,result:'normal'}})),[]);
 const lines=reportSummaryLines({id:'r',group_id:'g',meeting_date:'2026-11-01',meeting_label:null,status:'submitted',service:null,details:filled.details});
 assert.equal(lines[0],'진행 결과: 기타');
});

test('진행 결과 기타 보고를 제출하면 그대로 저장되고 사고 기록은 만들지 않는다',async()=>{const db=new PGlite();try{
 await db.exec(SUPABASE_STUB);for(const f of readdirSync('supabase/migrations').sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));await db.exec(readFileSync('supabase/seed.sql','utf8'));
 const writer=randomUUID();await db.query("insert into auth.users(id,email) values($1,'w@example.com')",[writer]);await db.query("insert into report.profiles(id,real_name,status) values($1,'작성자','active')",[writer]);
 const team=(await db.query("select id from report.groups where name='음향팀'")).rows[0].id;
 await db.query("insert into report.memberships(user_id,group_id,role,position) values($1,$2,'writer','오퍼레이터')",[writer,team]);
 const as=(sql,args=[])=>db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[writer]);return tx.query(sql,args);});
 const r=(await as("insert into report.reports(group_id,author_id,author_name,meeting_date,meeting_label) values($1,$2,'작성자',current_date,'수요예배') returning id,updated_at",[team,writer])).rows[0];
 const payload=worshipPayload.parse({...base,details:{...base.details,notes:'정전으로 10분 늦게 시작'}});
 const version=(await as('select report.autosave_report($1,$2,$3::jsonb) version',[r.id,r.updated_at,JSON.stringify(payload)])).rows[0].version;
 await as("select report.save_report_from_draft($1,$2::jsonb,'submitted',$3)",[r.id,JSON.stringify(payload),version]);
 const saved=(await as('select status,details from report.reports where id=$1',[r.id])).rows[0];
 assert.equal(saved.status,'submitted');assert.equal(saved.details.result,'other');
 assert.equal((await db.query('select id from report.worship_incidents where report_id=$1',[r.id])).rows.length,0);
}finally{await db.close();}});
