import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {SUPABASE_STUB} from './stub.mjs';

test('관리자가 직접 자기 보고를 추가·저장·제출하되 타인 보고·확인·자가 소속·출결 권한은 얻지 않는다',async()=>{
 const db=new PGlite();try{
  await db.exec(SUPABASE_STUB);const root=join(import.meta.dirname,'..','supabase');
  for(const file of readdirSync(join(root,'migrations')).sort())await db.exec(readFileSync(join(root,'migrations',file),'utf8'));
  await db.exec(readFileSync(join(root,'seed.sql'),'utf8'));
  const admin=randomUUID(),writer=randomUUID();for(const [id,name,isAdmin] of [[admin,'admin',true],[writer,'writer',false]]){
   await db.query('insert into auth.users(id,email) values($1,$2)',[id,name+'@example.com']);
   await db.query("insert into report.profiles(id,real_name,status,is_admin) values($1,$2,'active',$3)",[id,name,isAdmin]);
  }
  const sound=(await db.query("select id from report.groups where name='음향팀'")).rows[0].id;
  const school=(await db.query("select id from report.groups where name='초등부'")).rows[0].id;
  await db.query("insert into report.memberships(user_id,group_id,role) values($1,$2,'writer')",[writer,sound]);
  const foreign=(await db.query("insert into report.reports(group_id,author_id,author_name,meeting_date,meeting_label) values($1,$2,'타인',current_date,'예배') returning id",[sound,writer])).rows[0].id;
  const as=(sql,args=[])=>db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[admin]);return tx.query(sql,args)});
  const own=(await as("insert into report.reports(group_id,author_id,author_name,meeting_date,meeting_label) values($1,$2,'내 이름',current_date,'예배') returning id",[sound,admin])).rows[0].id;
  assert.equal((await as('select id from report.reports')).rows.length,1);
  await as("select report.save_report($1,$2::jsonb,'submitted')",[own,JSON.stringify({details:{result:'normal',notes:'내 보고',requests:[]},issues:[],messages:{pastor:'',pastor_wife:''}})]);
  assert.equal((await as('select status from report.reports where id=$1',[own])).rows[0].status,'submitted');
  assert.equal((await as('select report.can_review_report($1) as ok',[own])).rows[0].ok,false);
  assert.equal((await as('select report.can_view_report($1) as ok',[foreign])).rows[0].ok,false);
  assert.equal((await as('update report.reports set details=details where id=$1 returning id',[foreign])).rows.length,0);
  await assert.rejects(as("update report.reports set status='reviewed' where id=$1",[own]),/permission|forbidden|row-level/);
  await assert.rejects(as("insert into report.reports(group_id,author_id,author_name,meeting_date,meeting_label) values($1,$2,'대리',current_date,'예배')",[sound,writer]),/row-level/);
  await assert.rejects(as("select report.set_memberships($1,$2::jsonb)",[admin,JSON.stringify([{group_id:sound,role:'reviewer'}])]),/own content/);
  await db.query("insert into report.members(group_id,name,kind,status) values($1,'학생','student','active')",[school]);
  const education=(await as("insert into report.reports(group_id,author_id,author_name,meeting_date,meeting_label) values($1,$2,'내 이름',current_date,'교육 예배') returning id",[school,admin])).rows[0].id;
  assert.equal((await as('select id from report.members')).rows.length,0);
  await assert.rejects(as("update report.reports set status='submitted' where id=$1",[education]),/education attendance assignment/);
  assert.equal((await as('select status from report.reports where id=$1',[education])).rows[0].status,'draft');
  await db.query("update report.profiles set is_admin=false where id=$1",[admin]);
  assert.equal((await as('select report.can_create_report($1) as ok',[sound])).rows[0].ok,false);
 }finally{await db.close();}
});
