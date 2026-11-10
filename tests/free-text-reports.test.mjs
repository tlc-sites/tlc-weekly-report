import {test} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {SUPABASE_STUB} from './stub.mjs';
register('./tsx-loader.mjs',import.meta.url);
const {worshipPayload,otherPayload}=await import('../src/lib/report-forms.ts');
const {teamSessionPayload}=await import('../src/lib/team-session.ts');
const {incidentSchema}=await import('../src/lib/incidents.ts').then(m=>({incidentSchema:Object.values(m).find(v=>v?.shape?.circumstances)}));

const long='가'.repeat(20000);
const base={details:{result:'normal',notes:long,sermon_passage:'',sermon_content:long,rotation:long,requests:[{category:'기타',content:long}],mentions:[]},issues:[{category:'음향',content:long,status:'open',action:long}],messages:{pastor:long,pastor_wife:long}};

test('보고서 본문 칸은 글자수 제한 없이 통과하고, 한 줄 칸은 그대로 제한한다',()=>{
 const p=worshipPayload.safeParse(base);assert.ok(p.success,JSON.stringify(p.error?.issues?.slice(0,3)));
 assert.equal(worshipPayload.safeParse({...base,details:{...base.details,sermon_passage:'가'.repeat(101)}}).success,false);
 assert.equal(worshipPayload.safeParse({...base,issues:[{...base.issues[0],content:'  '}]}).success,false);
 const t=teamSessionPayload.safeParse({details:{session_type:'meeting',topic:'',passage:'',place:'',content:long,members:[{name:'김',present:false,note:long,follow_up:long}]},messages:{pastor:long,pastor_wife:''}});
 assert.ok(t.success,JSON.stringify(t.error?.issues?.slice(0,3)));
 if(incidentSchema){const s=incidentSchema.shape;for(const k of ['circumstances','cause','response','prevention'])assert.ok(s[k].safeParse(long).success,k);assert.equal(s.circumstances.safeParse('').success,false);}
});

test('DB54: 긴 본문을 저장·제출할 수 있고, 꼭 써야 하는 칸은 비면 거부한다',async()=>{const db=new PGlite();try{
 await db.exec(SUPABASE_STUB);for(const f of readdirSync('supabase/migrations').sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));await db.exec(readFileSync('supabase/seed.sql','utf8'));
 const writer=randomUUID();await db.query("insert into auth.users(id,email) values($1,'w@example.com')",[writer]);await db.query("insert into report.profiles(id,real_name,status) values($1,'작성자','active')",[writer]);
 const team=(await db.query("select id from report.groups where type='other' and parent_id is null and is_active order by name limit 1")).rows[0].id;
 const pos=(await db.query("select title from report.positions_for_group($1) where member_role='writer' limit 1",[team])).rows[0].title;
 await db.query("insert into report.memberships(user_id,group_id,role,position) values($1,$2,'writer',$3)",[writer,team,pos]);
 const as=(sql,args=[])=>db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[writer]);return tx.query(sql,args);});
 const r=(await as("insert into report.reports(group_id,author_id,author_name,meeting_date,meeting_label) values($1,$2,'작성자',current_date,'수요예배') returning id,updated_at",[team,writer])).rows[0];
 // 예배 보고는 이슈를 따로 저장하지 않으므로 기타 모임 보고로 이슈까지 확인한다
 const payload=otherPayload.parse({...base,details:{notes:long,content:long,song_list:long,requests:base.details.requests,mentions:[]}});
 // 자동저장은 1MB까지 (예전 한도 256KB를 넘는 크기)
 const big=JSON.stringify({...payload,details:{...payload.details,notes:'가'.repeat(150000)}});
 assert.ok(Buffer.byteLength(big)>262144);
 await as('select report.autosave_report($1,$2,$3::jsonb)',[r.id,r.updated_at,big]);
 const version=(await db.query('select updated_at from report.report_drafts where report_id=$1',[r.id])).rows[0].updated_at;
 await assert.rejects(as('select report.autosave_report($1,$2,$3::jsonb)',[r.id,version,JSON.stringify({x:'a'.repeat(1048577)})]),/invalid draft payload/);
 await as("select report.save_report_from_draft($1,$2::jsonb,'submitted',$3)",[r.id,JSON.stringify(payload),version]);
 const issue=(await db.query('select char_length(content) c,char_length(action) a from report.report_issues where report_id=$1',[r.id])).rows[0];
 assert.deepEqual(issue,{c:20000,a:20000});
 const msgs=(await db.query('select char_length(body) n from report.report_messages where report_id=$1',[r.id])).rows;
 assert.ok(msgs.length>=1&&msgs.every(m=>m.n===20000));
 await assert.rejects(db.query("insert into report.report_issues(report_id,category,content,status) values($1,'음향','','open')",[r.id]),/report_issues_content_check/);
 // 남겨 둔 한 줄 칸 제한과 바뀐 본문 칸 제한을 확인
 const defs=Object.fromEntries((await db.query("select conname,pg_get_constraintdef(oid) d from pg_constraint where connamespace='report'::regnamespace and contype='c'")).rows.map(x=>[x.conname,x.d]));
 for(const k of ['report_prayers_body_check','report_issues_action_check','prayer_meeting_reports_prayer_topics_check','prayer_meeting_reports_attendee_names_check','prayer_meeting_reports_notes_check','prayer_meeting_drafts_prayer_topics_check','prayer_meeting_drafts_attendee_names_check','worship_incidents_cause_check','worship_incidents_response_check','worship_incidents_prevention_check','worship_staff_staff_check'])assert.equal(defs[k],undefined,k);
 for(const k of ['report_issues_content_check','report_messages_body_check','prayer_meeting_reports_content_check','worship_incidents_circumstances_check'])assert.ok(defs[k]&&!/<=/.test(defs[k]),k);
 assert.match(defs.worship_incidents_title_check,/<= 100/);
 assert.match(defs.report_drafts_payload_check,/1048576/);
}finally{await db.close();}});
