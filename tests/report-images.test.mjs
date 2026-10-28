import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {SUPABASE_STUB} from './stub.mjs';

test('보고서 사진: 비공개 버킷, 작성자만 올리고 열람 권한자만 보며 5장까지',async()=>{const db=new PGlite();try{
 await db.exec(SUPABASE_STUB);for(const f of readdirSync('supabase/migrations').sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));await db.exec(readFileSync('supabase/seed.sql','utf8'));
 const bucket=(await db.query("select public,file_size_limit,allowed_mime_types from storage.buckets where id='report-images'")).rows[0];
 assert.equal(bucket.public,false);assert.equal(Number(bucket.file_size_limit),1048576);assert.deepEqual(bucket.allowed_mime_types,['image/jpeg']);
 const ids={};for(const name of ['writer','minister','outsider']){ids[name]=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[ids[name],name+'@example.com']);await db.query("insert into report.profiles(id,real_name,status,is_minister) values($1,$2,'active',$3)",[ids[name],name,name==='minister']);}
 const gid=(await db.query("select id from report.groups where name='조명팀'")).rows[0].id;
 await db.query("insert into report.memberships(user_id,group_id,role,position) values($1,$3,'writer','오퍼레이터'),($2,$3,'reviewer','담당교역자')",[ids.writer,ids.minister,gid]);
 async function as(name,sql,args=[]){return db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[ids[name]]);return tx.query(sql,args);});}
 const rid=(await as('writer',"insert into report.reports(group_id,author_id,author_name,meeting_date,meeting_label) values($1,$2,'조명',current_date,'주일') returning id",[gid,ids.writer])).rows[0].id;
 const path=()=>rid+'/'+randomUUID()+'.jpg';
 const upload=(who,p)=>as(who,"insert into storage.objects(bucket_id,name) values('report-images',$1) returning name",[p]);
 const attach=(who,p)=>as(who,'insert into report.report_images(report_id,path,caption,created_by) values($1,$2,$3,$4) returning id',[rid,p,'조명 밝기',ids[who]]);
 const first=path();
 await upload('writer',first);await attach('writer',first);
 await assert.rejects(upload('outsider',path()));
 await assert.rejects(upload('writer',rid+'/../x.jpg'));
 await assert.rejects(upload('writer',randomUUID()+'/'+randomUUID()+'.jpg'));
 await assert.rejects(attach('writer',randomUUID()+'/'+randomUUID()+'.jpg'));
 assert.equal((await as('outsider','select id from report.report_images')).rows.length,0);
 assert.equal((await as('outsider',"select name from storage.objects where bucket_id='report-images'")).rows.length,0);
 await as('writer',"select report.save_report($1,$2::jsonb,'submitted')",[rid,JSON.stringify({details:{result:'normal',notes:'밝기 비교',requests:[]}})]);
 assert.equal((await as('minister','select path from report.report_images')).rows[0].path,first);
 assert.equal((await as('minister',"select name from storage.objects where bucket_id='report-images'")).rows.length,1);
 for(let i=0;i<4;i++)await attach('writer',path());
 await assert.rejects(attach('writer',path()),/too many report images/);
 // 확인된 보고는 작성자가 더 이상 바꾸지 못한다
 await db.query("update report.reports set status='reviewed' where id=$1",[rid]);
 assert.equal((await as('writer','delete from report.report_images where path=$1 returning id',[first])).rows.length,0);
 assert.equal((await as('minister','delete from report.report_images where path=$1 returning id',[first])).rows.length,1);
}finally{await db.close();}});
