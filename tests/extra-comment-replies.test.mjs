import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFileSync,readdirSync} from 'node:fs';import {randomUUID} from 'node:crypto';import {SUPABASE_STUB} from './stub.mjs';
test('기도회·공지 답글: 원래 열람범위·작성자 위조 차단·알림 연결',async()=>{const db=new PGlite();try{
 await db.exec(SUPABASE_STUB);for(const f of readdirSync('supabase/migrations').sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));await db.exec(readFileSync('supabase/seed.sql','utf8'));
 const ids={};for(const name of ['minister','other','writer','outsider']){ids[name]=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[ids[name],name+'@example.com']);await db.query("insert into report.profiles(id,real_name,status,is_minister) values($1,$2,'active',$3)",[ids[name],name,['minister','other'].includes(name)]);}
 const gid=(await db.query("select id from report.groups where name='음향팀'")).rows[0].id;
 await db.query("insert into report.memberships(user_id,group_id,role,position) values($1,$2,'writer','오퍼레이터')",[ids.writer,gid]);
 async function as(name,sql,args=[]){return db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[ids[name]]);return tx.query(sql,args);});}
 const nid=(await db.query("insert into report.notices(author_id,target_group_id,audience,title,body) values($1,$2,'all','공지','본문') returning id",[ids.minister,gid])).rows[0].id;
 const nc=(await as('writer',"insert into report.notice_comments(notice_id,author_id,body) values($1,$2,'댓글') returning id",[nid,ids.writer])).rows[0].id;
 await as('writer',"insert into report.notice_comment_replies(comment_id,author_id,body) values($1,$2,'답글')",[nc,ids.writer]);
 await assert.rejects(as('outsider',"insert into report.notice_comment_replies(comment_id,author_id,body) values($1,$2,'외부')",[nc,ids.outsider]),/row-level/);
 assert.equal((await as('outsider','select * from report.notice_comment_replies')).rows.length,0);
 const pid=(await db.query("insert into report.prayer_meeting_reports(author_id,author_name,meeting_date,title,content,prayer_session,attendee_names,prayer_topics) values($1,'교역자',date_trunc('week',current_date)::date,'기도회','기도','morning','참석','기도') returning id",[ids.minister])).rows[0].id;
 const pc=(await as('minister',"insert into report.prayer_meeting_comments(prayer_report_id,author_id,body) values($1,$2,'코멘트') returning id",[pid,ids.minister])).rows[0].id;
 await as('other',"insert into report.prayer_comment_replies(comment_id,author_id,body) values($1,$2,'기도회 답글')",[pc,ids.other]);
 await assert.rejects(as('writer',"insert into report.prayer_comment_replies(comment_id,author_id,body) values($1,$2,'금지')",[pc,ids.writer]),/row-level/);
 await assert.rejects(as('other',"insert into report.prayer_comment_replies(comment_id,author_id,body) values($1,$2,'위조')",[pc,ids.minister]),/row-level/);
 assert.equal((await as('writer','select * from report.prayer_comment_replies')).rows.length,0);
 assert.equal((await as('minister','select * from report.inbox_notifications where prayer_report_id=$1',[pid])).rows.length,1);
 }finally{await db.close();}});
