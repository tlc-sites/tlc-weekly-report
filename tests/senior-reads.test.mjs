import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFileSync,readdirSync} from 'node:fs';import {randomUUID} from 'node:crypto';import {SUPABASE_STUB} from './stub.mjs';
test('최상단 실제 열람 기록: 두 역할 독립·위조 차단·버전 변경·초안 차단',async()=>{const db=new PGlite();try{
 await db.exec(SUPABASE_STUB);for(const f of readdirSync('supabase/migrations').sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));await db.exec(readFileSync('supabase/seed.sql','utf8'));
 const ids={};for(const name of ['pastor','pastor_wife','writer','admin','outsider','disabled']){ids[name]=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[ids[name],name+'@example.com']);await db.query('insert into report.profiles(id,real_name,status,is_admin,recipient_role) values($1,$2,$3,$4,$5)',[ids[name],name,name==='disabled'?'disabled':'active',name==='admin',name.startsWith('pastor')?name:null]);}
 const gid=(await db.query("select id from report.groups where name='음향팀'")).rows[0].id;await db.query("insert into report.memberships(user_id,group_id,role) values($1,$2,'writer')",[ids.writer,gid]);
 const r=(await db.query("insert into report.reports(group_id,author_id,author_name,meeting_date,meeting_label,status) values($1,$2,'작성자',current_date,'예배','submitted') returning id,updated_at",[gid,ids.writer])).rows[0];
 async function as(name,sql,args=[]){return db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[ids[name]]);return tx.query(sql,args);});}
 const mark=(name,version=r.updated_at)=>as(name,'select report.mark_senior_report_read($1,$2) seen',[r.id,version]);
 for(const name of ['writer','admin','disabled'])await assert.rejects(mark(name),/senior required/);
 const first=(await mark('pastor')).rows[0].seen;assert.deepEqual((await mark('pastor')).rows[0].seen,first);
 assert.equal((await as('writer','select * from report.senior_report_reads')).rows.length,1);
 assert.equal((await as('outsider','select * from report.senior_report_reads')).rows.length,0);
 await mark('pastor_wife');assert.equal((await as('writer','select * from report.senior_report_reads')).rows.length,2);
 await assert.rejects(as('pastor',"delete from report.senior_report_reads"),/permission/);
 const next=(await db.query("update report.reports set details='{\"notes\":\"수정\"}' where id=$1 returning updated_at",[r.id])).rows[0].updated_at;
 await assert.rejects(mark('pastor'),/version changed/);await mark('pastor',next);
 const rows=(await as('writer','select recipient_role,report_version from report.senior_report_reads')).rows;assert.deepEqual(rows.find(x=>x.recipient_role==='pastor').report_version,next);assert.deepEqual(rows.find(x=>x.recipient_role==='pastor_wife').report_version,r.updated_at);
 await db.query("update report.reports set status='draft' where id=$1",[r.id]);await assert.rejects(mark('pastor',next),/submitted report/);
 }finally{await db.close();}});
