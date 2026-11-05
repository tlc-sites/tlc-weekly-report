import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {SUPABASE_STUB} from './stub.mjs';
test('코멘트 알림 제목에 남긴 사람 이름이 들어간다',async()=>{
 const db=new PGlite();try{
 await db.exec(SUPABASE_STUB);
 for(const f of readdirSync('supabase/migrations').sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
 await db.exec(readFileSync('supabase/seed.sql','utf8'));
 const ids={};for(const [n,name] of [['writer','작성자갑'],['senior','목사을']]){ids[n]=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[ids[n],n+'@example.com']);await db.query("insert into report.profiles(id,real_name,status,recipient_role) values($1,$2,'active',$3)",[ids[n],name,n==='senior'?'pastor':null]);}
 const gid=(await db.query("select id from report.groups where name='음향팀'")).rows[0].id;
 await db.query("insert into report.memberships(user_id,group_id,role,position) values($1,$2,'writer','오퍼레이터')",[ids.writer,gid]);
 const rid=(await db.query("insert into report.reports(group_id,author_id,author_name,meeting_date,meeting_label) values($1,$2,'작성자',current_date,'수요예배') returning id",[gid,ids.writer])).rows[0].id;
 async function as(n,sql,args=[]){return db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[ids[n]]);return tx.query(sql,args);});}
 const cid=(await as('senior',"insert into report.report_comments(report_id,author_id,body) values($1,$2,'좋습니다') returning id",[rid,ids.senior])).rows[0].id;
 assert.deepEqual((await as('writer','select title from report.inbox_notifications')).rows.map(r=>r.title),['목사을님이 보고서에 코멘트를 남겼습니다']);
 await as('writer',"insert into report.report_comment_replies(comment_id,author_id,body) values($1,$2,'감사합니다')",[cid,ids.writer]);
 assert.deepEqual((await as('senior','select title from report.inbox_notifications')).rows.map(r=>r.title),['작성자갑님이 내 코멘트에 답글을 남겼습니다']);
 const iid=(await as('writer',"insert into report.worship_incidents(author_id,group_ids,occurred_on,service_name,title,circumstances) values($1,$2,current_date,'수요예배','이슈','경위') returning id",[ids.writer,[gid]])).rows[0].id;
 await as('senior',"insert into report.incident_comments(incident_id,author_id,body) values($1,$2,'확인') returning id",[iid,ids.senior]);
 assert.ok((await as('writer','select title from report.inbox_notifications')).rows.some(r=>r.title==='목사을님이 이슈에 코멘트를 남겼습니다'));
 // 다른 사람 이름을 꾸며 넣을 수 없다: 함수는 일반 사용자에게 열려 있지 않다
 await assert.rejects(as('writer','select report.comment_author_name($1)',[ids.senior]),/permission denied/);
 }finally{await db.close();}
});
