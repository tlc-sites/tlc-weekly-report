import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {SUPABASE_STUB} from './stub.mjs';

test('관리자는 현황만 계속 조회하고 지정 계정만 14일 이내 일반 내용을 읽으며 비공개·수정·자가 연장은 차단한다',async()=>{
 const db=new PGlite();
 try{
  await db.exec(SUPABASE_STUB);
  const root=join(import.meta.dirname,'..','supabase');
  for(const file of readdirSync(join(root,'migrations')).sort())await db.exec(readFileSync(join(root,'migrations',file),'utf8'));
  await db.exec(readFileSync(join(root,'seed.sql'),'utf8'));
  const ids={};for(const key of ['admin','otherAdmin','writer','pending']){
   ids[key]=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[ids[key],key+'@example.com']);
   await db.query('insert into report.profiles(id,real_name,status,is_admin) values($1,$2,$3,$4)',[ids[key],key,key==='pending'?'pending':'active',key.includes('Admin')||key==='admin']);
  }
  const gid=(await db.query("select id from report.groups where name='음향팀'")).rows[0].id;
  await db.query("insert into report.memberships(user_id,group_id,role) values($1,$2,'writer')",[ids.writer,gid]);
  const rid=(await db.query("insert into report.reports(group_id,author_id,author_name,meeting_date,meeting_label,details) values($1,$2,'작성자',current_date,'예배','{\"notes\":\"일반 내용 비밀값\"}') returning id",[gid,ids.writer])).rows[0].id;
  await db.query("insert into report.report_prayers(report_id,body) values($1,'기도 비밀값')",[rid]);
  await db.query("insert into report.report_messages(report_id,recipient,body) values($1,'pastor','비공개 비밀값')",[rid]);
  const child=(await db.query("insert into report.members(group_id,name) values($1,'아이') returning id",[gid])).rows[0].id;
  await db.query("insert into report.member_guardians(member_id,slot,name,contact,consent) values($1,1,'보호자','000-0000',true)",[child]);
  const week=(await db.query('select week::text as week from report.reports where id=$1',[rid])).rows[0].week;
  const as=(user,sql,args=[])=>db.transaction(async tx=>{await tx.exec(`set local role ${user?'authenticated':'anon'}`);if(user)await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[ids[user]]);return tx.query(sql,args)});
  const status=async user=>(await as(user,'select report.admin_submission_status($1) as data',[week])).rows[0].data;
  const incident=(await as('writer',"insert into report.worship_incidents(author_id,group_ids,occurred_on,service_name,title,circumstances,detailed) values($1,array[$2::uuid],current_date,'예배','일반 이슈','이슈 비밀값',false) returning id",[ids.writer,gid])).rows[0].id;
  const before=(await db.query('select to_jsonb(r) as body from report.reports r where id=$1',[rid])).rows[0].body;
  let result=await status('admin');assert.equal(result.reports.length,1);assert.equal(result.reports[0].can_open,false);
  assert.ok(!JSON.stringify(result).includes('비밀값'));assert.ok(!('details' in result.reports[0]));
  assert.equal((await as('admin','select id from report.reports')).rows.length,0);
  assert.equal((await as('admin','select id from report.worship_incidents')).rows.length,0);
  await assert.rejects(as('admin','select report.admin_submission_status($1::date+7)',[week]),/invalid report week/);
  await assert.rejects(status('writer'),/forbidden|permission/);await assert.rejects(status('pending'),/forbidden|permission/);await assert.rejects(status(null),/permission/);
  await db.query("insert into report.setup_access_grants values($1,now()-interval '1 hour',now()+interval '13 days')",[ids.admin]);
  assert.equal((await as('admin','select id from report.reports')).rows.length,1);assert.equal((await status('admin')).reports[0].can_open,true);
  assert.equal((await as('admin','select report.can_view_incident($1) as ok',[incident])).rows[0].ok,true);
  assert.equal((await as('admin','select id from report.worship_incidents')).rows.length,1);
  assert.equal((await as('admin',"update report.worship_incidents set title='수정' where id=$1 returning id",[incident])).rows.length,0);
  assert.equal((await as('otherAdmin','select id from report.reports')).rows.length,0);
  assert.equal((await as('admin','select report.can_review_report($1) as ok',[rid])).rows[0].ok,false);
  assert.equal((await as('admin','update report.reports set details=details where id=$1 returning id',[rid])).rows.length,0);
  for(const table of ['report_prayers','report_messages','members','member_guardians'])assert.equal((await as('admin',`select * from report.${table}`)).rows.length,0,table);
  await assert.rejects(as('admin',"update report.setup_access_grants set expires_at=now()+interval '14 days'"),/permission/);
  await assert.rejects(as('admin',"insert into report.setup_access_grants values($1,now(),now()+interval '1 day')",[ids.otherAdmin]),/permission/);
  await db.query("update report.setup_access_grants set starts_at=now()-interval '2 days',expires_at=now()-interval '1 second' where user_id=$1",[ids.admin]);
  assert.equal((await as('admin','select id from report.reports')).rows.length,0);
  result=await status('admin');assert.equal(result.reports.length,1);assert.equal(result.reports[0].can_open,false);assert.equal(result.setup_expires_at,null);
  assert.equal((await as('admin','select report.can_view_incident($1) as ok',[incident])).rows[0].ok,false);
  await db.query("update report.setup_access_grants set starts_at=now()+interval '1 hour',expires_at=now()+interval '1 day' where user_id=$1",[ids.admin]);
  assert.equal((await as('admin','select id from report.reports')).rows.length,0);
  await assert.rejects(db.query("update report.setup_access_grants set starts_at=now(),expires_at=now()+interval '15 days'"),/check constraint/);
  await db.query("update report.setup_access_grants set starts_at=now()-interval '1 hour',expires_at=now()+interval '1 hour' where user_id=$1",[ids.admin]);
  await db.query("update report.profiles set is_admin=false where id=$1",[ids.admin]);
  assert.equal((await as('admin','select id from report.reports')).rows.length,0);await assert.rejects(status('admin'),/forbidden/);
  assert.deepEqual((await db.query('select to_jsonb(r) as body from report.reports r where id=$1',[rid])).rows[0].body,before);
 }finally{await db.close();}
});
