import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {SUPABASE_STUB} from './stub.mjs';
test('기도회 보고 수정: 작성 교역자 본인만, 요일 검사 유지, 작성자 변경 불가',async()=>{const db=new PGlite();try{
 await db.exec(SUPABASE_STUB);for(const f of readdirSync('supabase/migrations').sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
 const ids={};for(const n of ['minister','other']){ids[n]=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[ids[n],n+'@example.com']);await db.query("insert into report.profiles(id,email,real_name,status,is_minister) values($1,$2,$3,'active',true)",[ids[n],n+'@example.com',n]);}
 async function as(n,sql,args=[]){return db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[ids[n]]);return tx.query(sql,args);});}
 const monday=(await db.query("select (current_date-((extract(dow from current_date)::int+6)%7)-7)::text d")).rows[0].d;
 const rid=(await as('minister',"insert into report.prayer_meeting_reports(author_id,author_name,meeting_date,title,content,prayer_session,attendee_names,prayer_topics) values($1,'교역자',$2,'오전기도회','기도제목 보고','morning','참석자','기도제목') returning id",[ids.minister,monday])).rows[0].id;
 const edit=(n,set,args=[])=>as(n,`update report.prayer_meeting_reports set ${set} where id=$1 returning id`,[rid,...args]);
 assert.equal((await edit('minister',"prayer_topics='고친 기도제목',attendee_names='참석자2'")).rows.length,1);
 assert.equal((await edit('other',"prayer_topics='남이 고침'")).rows.length,0);
 // 수요일은 오전기도회가 없다
 await assert.rejects(edit('minister',"meeting_date=$2::date+2",[monday]),/prayer day mismatch/);
 await assert.rejects(edit('minister',"prayer_topics='  '"),/required/);
 await assert.rejects(edit('minister',"author_id=$2",[ids.other]));
 assert.equal((await edit('minister',"prayer_session='evening',title='저녁기도회',meeting_date=$2::date+2",[monday])).rows.length,1);
 const row=(await db.query('select prayer_topics,prayer_session,author_id from report.prayer_meeting_reports where id=$1',[rid])).rows[0];
 assert.deepEqual(row,{prayer_topics:'고친 기도제목',prayer_session:'evening',author_id:ids.minister});
}finally{await db.close();}});
