import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {SUPABASE_STUB} from './stub.mjs';
test('알림 수신인 격리·읽음·피드백 답글·원문 권한 회수',async()=>{
 const db=new PGlite();try{
 await db.exec(SUPABASE_STUB);
 for(const f of readdirSync('supabase/migrations').sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
 await db.exec(readFileSync('supabase/seed.sql','utf8'));
 const ids={};for(const n of ['writer','senior','outsider']){ids[n]=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[ids[n],n+'@example.com']);await db.query("insert into report.profiles(id,real_name,status,recipient_role) values($1,$2,'active',$3)",[ids[n],n,n==='senior'?'pastor':null]);}
 const gid=(await db.query("select id from report.groups where name='음향팀'")).rows[0].id;
 await db.query("insert into report.memberships(user_id,group_id,role,position) values($1,$2,'writer','오퍼레이터')",[ids.writer,gid]);
 const rid=(await db.query("insert into report.reports(group_id,author_id,author_name,meeting_date,meeting_label) values($1,$2,'작성자',current_date,'수요예배') returning id",[gid,ids.writer])).rows[0].id;
 async function as(n,sql,args=[]){return db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[ids[n]]);return tx.query(sql,args);});}
 const cid=(await as('senior',"insert into report.report_comments(report_id,author_id,body) values($1,$2,'피드백') returning id",[rid,ids.senior])).rows[0].id;
 assert.equal((await as('writer','select * from report.inbox_notifications')).rows.length,1);
 assert.equal((await as('outsider','select * from report.inbox_notifications')).rows.length,0);
 await assert.rejects(as('outsider',"insert into report.report_comment_replies(comment_id,author_id,body) values($1,$2,'답글')",[cid,ids.outsider]),/row-level/);
 await assert.rejects(as('writer',"insert into report.report_comment_replies(comment_id,author_id,body) values($1,$2,'위조')",[cid,ids.senior]),/row-level/);
 await as('writer',"insert into report.report_comment_replies(comment_id,author_id,body) values($1,$2,'확인했습니다')",[cid,ids.writer]);
 const inbox=(await as('senior','select * from report.inbox_notifications')).rows;
 assert.equal(inbox.length,1);assert.equal(inbox[0].url,'/reports/'+rid+'#comments');
 await as('outsider','select report.read_notification($1)',[inbox[0].id]);
 assert.equal((await as('senior','select * from report.inbox_notifications')).rows[0].read_at,null);
 await as('senior','select report.read_notification($1)',[inbox[0].id]);
 assert.ok((await as('senior','select * from report.inbox_notifications')).rows[0].read_at);
 await assert.rejects(as('writer',"insert into report.report_comments(report_id,author_id,body) values($1,$2,'상위 코멘트')",[rid,ids.writer]),/row-level/);
 const iid=(await as('writer',"insert into report.worship_incidents(author_id,group_ids,occurred_on,service_name,title,circumstances) values($1,$2,current_date,'수요예배','이슈','경위') returning id",[ids.writer,[gid]])).rows[0].id;
 const icid=(await as('senior',"insert into report.incident_comments(incident_id,author_id,body) values($1,$2,'이슈 피드백') returning id",[iid,ids.senior])).rows[0].id;
 await as('writer',"insert into report.incident_comment_replies(comment_id,author_id,body) values($1,$2,'조치했습니다')",[icid,ids.writer]);
 await assert.rejects(as('outsider',"insert into report.incident_comment_replies(comment_id,author_id,body) values($1,$2,'무권한')",[icid,ids.outsider]),/row-level/);
 assert.ok((await as('senior','select * from report.inbox_notifications')).rows.some(n=>n.url==='/incidents/'+iid+'#comments'));
 await db.query("update report.profiles set status='disabled' where id=$1",[ids.writer]);
 assert.equal((await as('writer','select * from report.inbox_notifications')).rows.length,0);
 assert.equal((await as('writer','select * from report.report_comment_replies')).rows.length,0);
 }finally{await db.close();}
});
