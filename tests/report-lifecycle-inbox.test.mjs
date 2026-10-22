import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFileSync,readdirSync} from 'node:fs';import {randomUUID} from 'node:crypto';import {SUPABASE_STUB} from './stub.mjs';
test('보고 제출·교역자 수정 종 알림: 담당/두 분/작성자·중복/초안/개인정보 보호',async()=>{const db=new PGlite();try{
 await db.exec(SUPABASE_STUB);for(const f of readdirSync('supabase/migrations').sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));await db.exec(readFileSync('supabase/seed.sql','utf8'));
 const ids={};for(const name of ['writer','minister','foreign','pastor','pastor_wife','disabled','admin']){ids[name]=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[ids[name],name+'@example.com']);await db.query('insert into report.profiles(id,real_name,status,is_minister,is_admin,recipient_role,notify_enabled) values($1,$2,$3,$4,$5,$6,false)',[ids[name],name,name==='disabled'?'disabled':'active',['minister','foreign','disabled'].includes(name),name==='admin',name.startsWith('pastor')?name:null]);}
 const gid=(await db.query("select id from report.groups where name='음향팀'")).rows[0].id;
 for(const [name,role] of [['writer','writer'],['minister','reviewer'],['disabled','writer']])await db.query('insert into report.memberships(user_id,group_id,role,position) values($1,$2,$3,$4)',[ids[name],gid,role,name==='minister'?'담당교역자':'오퍼레이터']);
 async function as(name,sql,args=[]){return db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[ids[name]]);return tx.query(sql,args);});}
 const rid=(await as('writer',"insert into report.reports(group_id,author_id,author_name,meeting_date,meeting_label) values($1,$2,'작성자',current_date,'예배') returning id",[gid,ids.writer])).rows[0].id;
 await as('writer',"select report.save_report($1,$2::jsonb,'draft')",[rid,JSON.stringify({details:{result:'normal',notes:'본문 비밀'}})]);
 assert.equal((await db.query('select * from report.inbox_notifications')).rows.length,0);
 await as('writer',"select report.save_report($1,$2::jsonb,'submitted')",[rid,JSON.stringify({details:{result:'normal',notes:'본문 비밀'}})]);
 let rows=(await db.query('select user_id,title,body,report_id,url from report.inbox_notifications')).rows;
 assert.deepEqual(rows.map(r=>r.user_id).sort(),['minister','pastor','pastor_wife'].map(n=>ids[n]).sort());
 for(const row of rows){assert.equal(row.report_id,rid);assert.equal(row.url,'/reports/'+rid);assert.ok(!row.body.includes('본문 비밀'));}
 await db.exec('delete from report.inbox_notifications');
 await as('minister',"update report.reports set details='{\"notes\":\"교역자 수정 비밀\"}' where id=$1",[rid]);
 rows=(await db.query('select user_id,title,body from report.inbox_notifications')).rows;
 assert.deepEqual(rows.map(r=>r.user_id).sort(),['writer','pastor','pastor_wife'].map(n=>ids[n]).sort());
 assert.ok(rows.every(r=>r.title.includes('수정')&&!r.body.includes('수정 비밀')));
 assert.equal((await as('writer','select * from report.inbox_notifications')).rows.length,1);
 assert.equal((await as('foreign','select * from report.inbox_notifications')).rows.length,0);
 await db.exec('delete from report.inbox_notifications');
 await as('minister',"update report.reports set status='reviewed' where id=$1",[rid]);assert.equal((await db.query('select * from report.inbox_notifications')).rows.length,0);
 }finally{await db.close();}});
