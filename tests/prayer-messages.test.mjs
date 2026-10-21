import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {SUPABASE_STUB} from './stub.mjs';
test('기도회는 교역자 공동 공유, 비공개 메시지는 두 분과 지정 교역자만',async()=>{
 const db=new PGlite();try{
 await db.exec(SUPABASE_STUB);for(const f of readdirSync('supabase/migrations').sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
 const ids={};for(const n of ['pastor','wife','minister','other','lead','admin','pending']){ids[n]=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[ids[n],n+'@example.com']);await db.query('insert into report.profiles(id,real_name,status,is_admin,is_minister,recipient_role) values($1,$2,$3,$4,$5,$6)',[ids[n],n,n==='pending'?'pending':'active',n==='admin',['minister','other','pending'].includes(n),n==='pastor'?'pastor':n==='wife'?'pastor_wife':null]);}
 async function as(n,sql,args=[]){return db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[ids[n]]);return tx.query(sql,args);});}
 await as('minister',"insert into report.prayer_meeting_reports(author_id,author_name,meeting_date,title,content,prayer_session,attendee_names,prayer_topics) values($1,'교역자',(current_date-((extract(dow from current_date)::int+6)%7)),'기도회','내용','morning','참석자','기도제목')",[ids.minister]);
 for(const n of ['pastor','wife','minister','other'])assert.equal((await as(n,'select * from report.prayer_meeting_reports')).rows.length,1);
 for(const n of ['lead','admin','pending']){assert.equal((await as(n,'select * from report.prayer_meeting_reports')).rows.length,0);await assert.rejects(as(n,"insert into report.prayer_meeting_reports(author_id,author_name,meeting_date,title,content,prayer_session,attendee_names,prayer_topics) values($1,'작성자',(current_date-((extract(dow from current_date)::int+6)%7)),'제목','내용','morning','참석자','기도제목')",[ids[n]]),/row-level/);}
 await assert.rejects(as('minister',"insert into report.prayer_meeting_reports(author_id,author_name,meeting_date,title,content,prayer_session,attendee_names,prayer_topics) values($1,'작성자',current_date+7-((extract(dow from current_date)::int+6)%7),'미래','내용','morning','참석자','기도제목')",[ids.minister]),/check constraint/);
 const tid=(await as('pastor',"select report.start_minister_thread($1,'제목','비공개 본문') id",[ids.minister])).rows[0].id;
 for(const n of ['pastor','wife','minister'])assert.equal((await as(n,'select * from report.minister_messages')).rows.length,1);
 for(const n of ['other','lead','admin','pending']){assert.equal((await as(n,'select * from report.minister_threads')).rows.length,0);assert.equal((await as(n,'select * from report.minister_messages')).rows.length,0);await assert.rejects(as(n,"insert into report.minister_messages(thread_id,author_id,body) values($1,$2,'무단 답장')",[tid,ids[n]]),/row-level/);}
 await as('minister',"insert into report.minister_messages(thread_id,author_id,body) values($1,$2,'답장')",[tid,ids.minister]);
 assert.ok((await as('wife','select * from report.inbox_notifications')).rows.some(n=>n.minister_thread_id===tid));
 assert.equal((await as('other','select * from report.inbox_notifications')).rows.length,0);
 await assert.rejects(as('minister',"select report.start_minister_thread($1,'제목','본문')",[ids.other]),/row-level/);
 await assert.rejects(as('pastor',"select report.start_minister_thread($1,'제목','본문')",[ids.admin]),/row-level/);
 await assert.rejects(as('pastor',"select report.start_minister_thread($1,'제목','')",[ids.minister]),/check constraint/);
 assert.equal((await as('pastor','select * from report.minister_threads')).rows.length,1,'본문 실패시 빈 대화 생성도 롤백');
 await db.query('update report.profiles set is_minister=false where id=$1',[ids.minister]);
 assert.equal((await as('minister','select * from report.minister_messages')).rows.length,0);
 assert.equal((await as('minister','select * from report.inbox_notifications')).rows.length,0);
 }finally{await db.close();}
});
