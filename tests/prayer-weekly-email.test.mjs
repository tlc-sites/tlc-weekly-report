import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {SUPABASE_STUB} from './stub.mjs';
test('기도회 오전/저녁 요일·명단·코멘트·메일 최상단 수신/중복 차단',async()=>{
 const db=new PGlite();try{
 await db.exec(SUPABASE_STUB);for(const f of readdirSync('supabase/migrations').sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
 const ids={};for(const n of ['minister','wife','admin']){ids[n]=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[ids[n],n+'@example.com']);await db.query("insert into report.profiles(id,email,real_name,status,is_admin,is_minister,recipient_role) values($1,$2,$3,'active',$4,$5,$6)",[ids[n],n+'@example.com',n,n==='admin',n==='minister',n==='wife'?'pastor_wife':null]);}
 async function as(n,sql,args=[]){return db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[ids[n]]);return tx.query(sql,args);});}
 const monday=(await db.query("select (current_date-((extract(dow from current_date)::int+6)%7)-7)::text d")).rows[0].d;
 const rid=(await as('minister',"insert into report.prayer_meeting_reports(author_id,author_name,meeting_date,title,content,prayer_session,attendee_names,prayer_topics) values($1,'교역자',$2,'오전기도회','기도제목','morning','참석자','기도제목') returning id",[ids.minister,monday])).rows[0].id;
 await assert.rejects(as('minister',"insert into report.prayer_meeting_reports(author_id,author_name,meeting_date,title,content,prayer_session,attendee_names,prayer_topics) values($1,'교역자',$2::date+2,'오전기도회','기도제목','morning','참석자','기도제목')",[ids.minister,monday]),/prayer day mismatch/);
 await as('minister',"insert into report.prayer_meeting_reports(author_id,author_name,meeting_date,title,content,prayer_session,attendee_names,prayer_topics) values($1,'교역자',$2::date+2,'저녁기도회','기도제목','evening','참석자','기도제목')",[ids.minister,monday]);
 await as('wife',"insert into report.prayer_meeting_comments(prayer_report_id,author_id,body) values($1,$2,'함께 기도하겠습니다')",[rid,ids.wife]);
 assert.equal((await as('minister','select * from report.prayer_meeting_comments')).rows.length,1);
 assert.equal((await as('admin','select * from report.prayer_meeting_comments')).rows.length,0);
 assert.equal((await as('minister','select * from report.inbox_notifications')).rows[0].prayer_report_id,rid);
 const week=(await db.query('select (current_date-extract(dow from current_date)::int)::text d')).rows[0].d;
 assert.equal((await db.query('select report.claim_weekly_email($1,$2) ok',[week,ids.admin])).rows[0].ok,false);
 assert.equal((await db.query('select report.claim_weekly_email($1,$2) ok',[week,ids.wife])).rows[0].ok,true);
 assert.equal((await db.query('select report.claim_weekly_email($1,$2) ok',[week,ids.wife])).rows[0].ok,false);
 await assert.rejects(as('admin','select report.claim_weekly_email($1,$2)',[week,ids.wife]),/permission denied/);
 await db.query("update report.weekly_email_deliveries set status='sent' where recipient_id=$1",[ids.wife]);
 assert.equal((await db.query('select report.claim_weekly_email($1,$2) ok',[week,ids.wife])).rows[0].ok,false);
 }finally{await db.close();}
});
