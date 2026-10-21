import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {SUPABASE_STUB} from './stub.mjs';
import {positionsForGroup,positionRole,parsePositionValue} from '../src/lib/positions.ts';

test('파트별 직책·복수 직급·교역자 담당 범위·기존 소속 보존·직책 위조 차단',async()=>{
 const db=new PGlite();try{
  await db.exec(SUPABASE_STUB);const root=join(import.meta.dirname,'..','supabase');const files=readdirSync(join(root,'migrations')).sort();
  for(const file of files.filter(f=>f<'20261101000000'))await db.exec(readFileSync(join(root,'migrations',file),'utf8'));
  await db.exec(readFileSync(join(root,'seed.sql'),'utf8'));
  const ids={};for(const name of ['mixed','admin','writer','legacy','pending']){
   ids[name]=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[ids[name],name+'@example.com']);
   await db.query('insert into report.profiles(id,real_name,status,is_admin,is_minister) values($1,$2,$3,$4,$5)',[ids[name],name,name==='pending'?'pending':'active',['mixed','admin'].includes(name),['mixed','legacy'].includes(name)]);
  }
  const groups=(await db.query('select id,name,type,settings from report.groups')).rows;const group=name=>groups.find(g=>g.name===name).id;
  const oldGroup=group('초등부');await db.query("insert into report.memberships(user_id,group_id,role) values($1,$2,'reviewer')",[ids.legacy,oldGroup]);
  const old=(await db.query("insert into report.reports(group_id,author_id,author_name,meeting_date,meeting_label,details) values($1,$2,'기존 작성자',current_date,'예배','{\"notes\":\"원본\"}') returning id",[oldGroup,ids.legacy])).rows[0].id;
  const before=(await db.query('select to_jsonb(r) as body from report.reports r where id=$1',[old])).rows[0].body;
  for(const file of files.filter(f=>f>='20261101000000'))await db.exec(readFileSync(join(root,'migrations',file),'utf8'));
  assert.deepEqual((await db.query('select to_jsonb(r) as body from report.reports r where id=$1',[old])).rows[0].body,before);
  for(const g of (await db.query('select id,name,type,settings from report.groups')).rows){
   const choices=(await db.query('select * from report.positions_for_group($1)',[g.id])).rows;
   assert.deepEqual(choices.map(c=>c.title),positionsForGroup(g),g.name);
   for(const c of choices)assert.equal(c.member_role,positionRole(c.title));
  }
  assert.equal((await db.query("select count(*)::int as n from report.groups where name='사진팀'")).rows[0].n,1);
  assert.ok((await db.query("select 1 from report.group_service_types s join report.groups g on g.id=s.group_id where g.name='사진팀'")).rows.length);
  const desired=[['예배팀','예배인도자',1],['음향팀','오퍼레이터',1],['조명팀','담당교역자',3],['베리타스 기독국제중','파트',1],['영상팀','예배총괄',2],['부산 캠퍼스','담당교역자',3]];
  for(const [name,position,layer] of desired){
   const gid=group(name);await db.query('insert into report.memberships(user_id,group_id,role,position) values($1,$2,$3,$4)',[ids.mixed,gid,positionRole(position),position]);
   assert.equal((await db.query('select report.group_content_layer($1,$2) as layer',[ids.mixed,gid])).rows[0].layer,layer);
   const mine=(await db.query("insert into report.reports(group_id,author_id,author_name,meeting_date,meeting_label) values($1,$2,'본인',current_date,'예배') returning author_layer",[gid,ids.mixed])).rows[0];assert.equal(mine.author_layer,layer);
   await db.query("insert into report.memberships(user_id,group_id,role) values($1,$2,'writer')",[ids.writer,gid]);
   const rid=(await db.query("insert into report.reports(group_id,author_id,author_name,meeting_date,meeting_label) values($1,$2,'다른 작성자',current_date,'예배') returning id",[gid,ids.writer])).rows[0].id;
   await db.query("insert into report.report_prayers(report_id,body) values($1,'비공개')",[rid]);
  }
  const as=(user,sql,args=[])=>db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[ids[user]]);return tx.query(sql,args)});
  for(const [name,position] of desired){
   const gid=group(name);const allowed=position==='담당교역자';
   assert.equal((await as('mixed','select report.assigned_clergy($1) as ok',[gid])).rows[0].ok,allowed,name);
   assert.equal((await as('mixed','select report.can_review_group($1) as ok',[gid])).rows[0].ok,allowed,name);
  }
  const prayers=(await as('mixed','select r.group_id from report.report_prayers p join report.reports r on r.id=p.report_id')).rows.map(r=>r.group_id).sort();
  assert.deepEqual(prayers,[group('조명팀'),group('부산 캠퍼스')].sort());
  for(const layer of [1,2,3])assert.equal((await as('mixed','select report.same_content_layer($1) as ok',[layer])).rows[0].ok,true);
  await assert.rejects(as('admin',"select report.set_memberships($1,$2::jsonb)",[ids.mixed,JSON.stringify([{group_id:group('영상팀'),role:'reviewer',position:'오퍼레이터'}])]),/invalid group position/);
  assert.equal((await db.query('select count(*)::int as n from report.memberships where user_id=$1',[ids.mixed])).rows[0].n,6);
  await assert.rejects(as('admin',"select report.set_memberships($1,$2::jsonb)",[ids.writer,JSON.stringify([{group_id:group('영상팀'),role:'reviewer',position:'담당교역자'}])]),/minister role required/);
  await assert.rejects(as('admin',"select report.set_memberships($1,$2::jsonb)",[ids.mixed,JSON.stringify([{group_id:group('영상팀'),role:'reviewer'}])]),/position required/);
  await assert.rejects(as('mixed',"select report.set_memberships($1,'[]')",[ids.mixed]),/own content/);
  await as('admin','select report.set_memberships($1,$2::jsonb)',[ids.legacy,JSON.stringify([{group_id:oldGroup,role:'reviewer'}])]);
  assert.equal((await db.query('select position from report.memberships where user_id=$1',[ids.legacy])).rows[0].position,null);
  await as('admin','select report.approve_user($1,$2::jsonb,false)',[ids.pending,JSON.stringify([{group_id:group('예배팀'),role:'writer',position:'예배인도자'}])]);
  assert.equal((await db.query('select position from report.memberships where user_id=$1',[ids.pending])).rows[0].position,'예배인도자');
  assert.equal(parsePositionValue('position:예배인도자').role,'writer');assert.equal(parsePositionValue('position:예배총괄').role,'reviewer');assert.equal(parsePositionValue('position:없는 직책'),null);
 }finally{await db.close();}
});
