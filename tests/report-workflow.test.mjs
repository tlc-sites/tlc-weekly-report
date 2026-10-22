import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFileSync,readdirSync} from 'node:fs';import {randomUUID} from 'node:crypto';import {SUPABASE_STUB} from './stub.mjs';
test('기술팀 정상제출·전팀해당없음·부산재정필수·본인코멘트수정',async()=>{const db=new PGlite();try{
 await db.exec(SUPABASE_STUB);for(const f of readdirSync('supabase/migrations').sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));await db.exec(readFileSync('supabase/seed.sql','utf8'));
 const ids={};for(const name of ['writer','minister','foreign']){ids[name]=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[ids[name],name+'@example.com']);await db.query("insert into report.profiles(id,real_name,status,is_minister) values($1,$2,'active',$3)",[ids[name],name,name!=='writer']);}
 const sound=(await db.query("select id from report.groups where name='조명팀'")).rows[0].id,campus=(await db.query("select id from report.groups where type='campus' limit 1")).rows[0].id;
 await db.query("insert into report.memberships(user_id,group_id,role,position) values($1,$3,'writer','오퍼레이터'),($2,$3,'reviewer','담당교역자'),($2,$4,'reviewer','담당교역자')",[ids.writer,ids.minister,sound,campus]);
 async function as(name,sql,args=[]){return db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[ids[name]]);return tx.query(sql,args);});}
 const r=(await as('writer',"insert into report.reports(group_id,author_id,author_name,meeting_date,meeting_label) values($1,$2,'작성자',current_date,'수요예배') returning id,updated_at",[sound,ids.writer])).rows[0];
 const payload={details:{result:'normal',notes:'특이사항 없습니다.'},issues:[],messages:{pastor:'',pastor_wife:''}};
 const version=(await as('writer','select report.autosave_report($1,$2,$3::jsonb) version',[r.id,r.updated_at,JSON.stringify(payload)])).rows[0].version;
 await as('writer',"select report.save_report_from_draft($1,$2::jsonb,'submitted',$3)",[r.id,JSON.stringify(payload),version]);
 assert.equal((await as('writer','select status from report.reports where id=$1',[r.id])).rows[0].status,'submitted');
 const week=(await db.query("select current_date-extract(dow from current_date)::int week")).rows[0].week;
 await as('writer',"insert into report.week_status(group_id,week,no_meeting,reason,set_by) values($1,$2,true,'미배정',$3)",[sound,week,ids.writer]);
 await assert.rejects(as('foreign',"insert into report.week_status(group_id,week,no_meeting,reason,set_by) values($1,$2,true,'권한없음',$3)",[campus,week,ids.foreign]),/row-level/);
 const c=(await as('minister',"insert into report.reports(group_id,author_id,author_name,meeting_date,meeting_label) values($1,$2,'교역자',current_date,'부산') returning id",[campus,ids.minister])).rows[0].id;
 await assert.rejects(as('minister',"select report.save_report($1,$2::jsonb,'submitted')",[c,JSON.stringify({details:{}})]),/campus offerings required/);
 const finances={offerings:[],offerings_other:'없음',counts:{train:0,bus:0,taxi:0,parking:0,meals:0},lodging:'지출 없음'};
 await as('minister',"select report.save_report($1,$2::jsonb,'submitted')",[c,JSON.stringify({details:finances})]);
 const comment=(await as('minister',"insert into report.report_comments(report_id,author_id,body) values($1,$2,'원문') returning id",[r.id,ids.minister])).rows[0].id;
 await as('minister',"update report.report_comments set body='수정문' where id=$1",[comment]);
 assert.equal((await as('writer','select body from report.report_comments where id=$1',[comment])).rows[0].body,'수정문');
 assert.equal((await as('foreign',"update report.report_comments set body='위조' where id=$1 returning id",[comment])).rows.length,0);
 await assert.rejects(as('minister','update report.report_comments set author_id=$1 where id=$2',[ids.foreign,comment]),/permission/);
 }finally{await db.close();}});
