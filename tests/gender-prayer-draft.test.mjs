import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {SUPABASE_STUB} from './stub.mjs';
async function setup(){const db=new PGlite();await db.exec(SUPABASE_STUB);for(const f of readdirSync('supabase/migrations').sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));return db;}
test('명단 성별: 남·여·미입력만 허용',async()=>{const db=await setup();try{
 await db.exec(readFileSync('supabase/seed.sql','utf8'));const group=(await db.query("select id from report.groups where type='education' limit 1")).rows[0].id;
 const add=g=>db.query("insert into report.members(group_id,name,gender) values($1,'학생',$2) returning gender",[group,g]);
 assert.equal((await add('male')).rows[0].gender,'male');assert.equal((await add('female')).rows[0].gender,'female');assert.equal((await add(null)).rows[0].gender,null);
 await assert.rejects(add('M'),/check/);
}finally{await db.close();}});
test('기도회 임시저장: 교역자 본인만 보고 고치고, 교역자가 아니면 못 만든다',async()=>{const db=await setup();try{
 const ids={};for(const [n,m] of [['minister',true],['other',true],['teacher',false]]){ids[n]=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[ids[n],n+'@example.com']);await db.query("insert into report.profiles(id,email,real_name,status,is_minister) values($1,$2,$3,'active',$4)",[ids[n],n+'@example.com',n,m]);}
 async function as(n,sql,args=[]){return db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[ids[n]]);return tx.query(sql,args);});}
 const save=(n,author,topics)=>as(n,"insert into report.prayer_meeting_drafts(author_id,prayer_session,attendee_names,prayer_topics) values($1,'morning','',$2) on conflict(author_id) do update set prayer_topics=excluded.prayer_topics",[author,topics]);
 await save('minister',ids.minister,'쓰는 중');await save('minister',ids.minister,'고쳐 쓰는 중');
 assert.deepEqual((await as('minister','select prayer_topics,meeting_date from report.prayer_meeting_drafts')).rows,[{prayer_topics:'고쳐 쓰는 중',meeting_date:null}]);
 assert.equal((await as('other','select * from report.prayer_meeting_drafts')).rows.length,0);
 assert.equal((await as('other',"update report.prayer_meeting_drafts set prayer_topics='남이 고침' returning 1")).rows.length,0);
 assert.equal((await as('other','delete from report.prayer_meeting_drafts returning 1')).rows.length,0);
 await assert.rejects(save('other',ids.minister,'남의 이름으로'),/row-level/);
 await assert.rejects(save('teacher',ids.teacher,'교역자 아님'),/row-level/);
 await assert.rejects(as('minister',"update report.prayer_meeting_drafts set prayer_session='night'"),/check/);
 assert.equal((await as('minister','delete from report.prayer_meeting_drafts returning 1')).rows.length,1);
}finally{await db.close();}});
