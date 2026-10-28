import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {SUPABASE_STUB} from './stub.mjs';
import {positionsForGroup} from '../src/lib/positions.ts';

async function setup(){
 const db=new PGlite();await db.exec(SUPABASE_STUB);
 for(const f of readdirSync('supabase/migrations').sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
 await db.exec(readFileSync('supabase/seed.sql','utf8'));
 const ids={};
 for(const name of ['sound','video','light','admin','staffMinister','extra']){ids[name]=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[ids[name],name+'@example.com']);
  await db.query('insert into report.profiles(id,real_name,status,is_minister,is_admin) values($1,$2,$3,$4,$5)',[ids[name],name,'active',name==='staffMinister',name==='admin']);}
 const gid=async name=>(await db.query('select id from report.groups where name=$1',[name])).rows[0].id;
 async function as(name,sql,args=[]){return db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[ids[name]]);return tx.query(sql,args);});}
 return {db,ids,gid,as};
}

test('예배위원·PD 파트: 다시 실행해도 하나만 있고 PD는 1~3부·라이프라인만 연결된다',async()=>{const {db}=await setup();try{
 await db.exec(readFileSync('supabase/migrations/20261119000000_worship_staff_group.sql','utf8'));
 assert.equal((await db.query("select count(*)::int n from report.groups where name='예배위원'")).rows[0].n,1);
 const pdServices=(await db.query("select s.name from report.group_service_types gs join report.groups g on g.id=gs.group_id join report.service_types s on s.id=gs.service_type_id where g.name='PD' order by s.sort_order")).rows.map(r=>r.name);
 assert.ok(['1부 예배','2부 예배','3부 예배','라이프라인'].every(n=>pdServices.includes(n)));
 for(const g of (await db.query("select id,name,type,settings from report.groups where is_active")).rows){
  const choices=(await db.query('select title from report.positions_for_group($1)',[g.id])).rows.map(r=>r.title);
  assert.deepEqual(choices,positionsForGroup(g),g.name);
 }
}finally{await db.close();}});

test('기타 교역자: 배정하면 교역자로 지정되고 작성만 가능하며 검토 권한은 없다',async()=>{const {db,ids,gid,as}=await setup();try{
 const staff=await gid('예배위원');
 await as('admin',"select report.set_memberships_with_minister($1,$2::jsonb)",[ids.extra,JSON.stringify([{group_id:staff,role:'writer',position:'기타 교역자'}])]);
 assert.equal((await db.query('select is_minister from report.profiles where id=$1',[ids.extra])).rows[0].is_minister,true);
 assert.equal((await db.query('select role from report.memberships where user_id=$1',[ids.extra])).rows[0].role,'writer');
 assert.equal((await as('extra','select report.can_create_report($1) ok',[staff])).rows[0].ok,true);
 assert.equal((await as('extra','select report.can_review_group($1) ok',[staff])).rows[0].ok,false);
 await assert.rejects(as('admin',"select report.set_memberships_with_minister($1,$2::jsonb)",[ids.extra,JSON.stringify([{group_id:staff,role:'reviewer',position:'기타 교역자'}])]),/invalid group position/);
}finally{await db.close();}});

test('부서 멘션: 교역자 보고를 제출하면 멘션된 팀원만 읽고 알림을 받으며, 멘션을 빼면 다시 닫힌다',async()=>{const {db,ids,gid,as}=await setup();try{
 const [staff,video,light]=[await gid('예배위원'),await gid('영상팀'),await gid('조명팀')];
 await as('admin',"select report.set_memberships_with_minister($1,$2::jsonb)",[ids.extra,JSON.stringify([{group_id:staff,role:'writer',position:'기타 교역자'}])]);
 for(const [u,g] of [['video',video],['light',light]])await db.query("insert into report.memberships(user_id,group_id,role,position) values($1,$2,'writer',$3)",[ids[u],g,g===video?null:'오퍼레이터']);
 const rid=(await as('extra',"insert into report.reports(group_id,author_id,author_name,meeting_date,meeting_label) values($1,$2,'헌금 인도 교역자',current_date,'수요예배') returning id,author_layer",[staff,ids.extra])).rows[0];
 assert.equal(rid.author_layer,3);
 const body=m=>JSON.stringify({details:{result:'normal',notes:'봉독자 위치 표시 요청',requests:[],mentions:m}});
 await as('extra',"select report.save_report($1,$2::jsonb,'draft')",[rid.id,body([video])]);
 assert.equal((await db.query('select count(*)::int n from report.report_mentions')).rows[0].n,0);
 assert.equal((await as('video','select id from report.reports where id=$1',[rid.id])).rows.length,0);
 // 자기 부서·없는 부서는 무시한다
 await as('extra',"select report.save_report($1,$2::jsonb,'submitted')",[rid.id,body([video,staff,randomUUID()])]);
 assert.deepEqual((await db.query('select group_id from report.report_mentions where report_id=$1',[rid.id])).rows.map(r=>r.group_id),[video]);
 assert.equal((await as('video','select id from report.reports where id=$1',[rid.id])).rows.length,1);
 assert.equal((await as('video','select report.can_view_report($1) ok',[rid.id])).rows[0].ok,true);
 assert.equal((await as('light','select id from report.reports where id=$1',[rid.id])).rows.length,0);
 const inbox=(await as('video',"select title,body from report.inbox_notifications where report_id=$1 and report_event_key like '%:mention:%'",[rid.id])).rows;
 assert.equal(inbox.length,1);assert.ok(!inbox[0].body.includes('봉독자'));
 assert.equal((await db.query("select count(*)::int n from report.inbox_notifications where user_id=$1 and report_event_key like '%:mention:%'",[ids.light])).rows[0].n,0);
 // 다시 저장해도 알림이 겹치지 않는다
 await as('extra',"select report.save_report($1,$2::jsonb,'submitted')",[rid.id,body([video])]);
 assert.equal((await db.query("select count(*)::int n from report.inbox_notifications where user_id=$1 and report_event_key like '%:mention:%'",[ids.video])).rows[0].n,1);
 await as('extra',"select report.save_report($1,$2::jsonb,'submitted')",[rid.id,body([])]);
 assert.equal((await as('video','select id from report.reports where id=$1',[rid.id])).rows.length,0);
 // 멘션 표는 직접 쓸 수 없다
 await assert.rejects(as('light','insert into report.report_mentions(report_id,group_id) values($1,$2)',[rid.id,light]));
}finally{await db.close();}});
