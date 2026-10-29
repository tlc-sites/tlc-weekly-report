import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {SUPABASE_STUB} from './stub.mjs';

const files=readdirSync('supabase/migrations').sort();
async function migrate(db,before){await db.exec(SUPABASE_STUB);for(const f of files.filter(f=>!before||f<before))await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));}
async function as(db,id,sql,args){return db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);return tx.query(sql,args);});}

// 운영처럼 '성찬팀'과 '성찬준비팀'이 있던 상태를 만든다 (seed는 이미 새 이름이라 되돌린다).
async function legacyCommunion(db,prepActive){
 await migrate(db,'20261118000000');await db.exec(readFileSync('supabase/seed.sql','utf8'));
 const parent=(await db.query("select id from report.groups where name='예배/기술팀' and parent_id is null")).rows[0];
 await db.query("delete from report.group_service_types where group_id in (select id from report.groups where name='성찬위원')");
 await db.query("delete from report.groups where name='성찬위원'");
 const team=(await db.query("update report.groups set name='성찬팀',sort_order=7 where name='성찬 준비팀' returning id")).rows[0];
 await db.query("insert into report.groups(type,name,parent_id,schedule,sort_order,is_active) values('worship','성찬준비팀',$1,'weekly',8,$2)",[parent.id,prepActive]);
 return {parent,team};
}

test('명단: 학교 칸과 장기 결석자·장기 방문자 상태를 담당 교역자가 저장하고 재적 수에서는 뺀다',async()=>{const db=new PGlite();try{
 await migrate(db);await db.exec(readFileSync('supabase/seed.sql','utf8'));
 const group=(await db.query("select id from report.groups where name='중등부'")).rows[0];
 const [clergy,other]=[randomUUID(),randomUUID()];
 for(const id of [clergy,other]){await db.query('insert into auth.users(id,email) values($1,$2)',[id,id+'@example.com']);await db.query("insert into report.profiles(id,status,is_minister) values($1,'active',true)",[id]);}
 await db.query("insert into report.memberships(user_id,group_id,role,position) values($1,$2,'reviewer','교역자')",[clergy,group.id]);
 const ids=(await as(db,clergy,"insert into report.members(group_id,name,kind,status,school) values($1,'가',  'student','active','정자중'),($1,'나','student','long_absent',null),($1,'다','student','long_visitor',null) returning id,school",[group.id])).rows;
 assert.equal(ids[0].school,'정자중');
 assert.equal((await as(db,clergy,"update report.members set status='long_absent' where id=$1 returning status",[ids[0].id])).rows[0].status,'long_absent');
 assert.equal((await as(db,other,"update report.members set school='외부' where id=$1 returning id",[ids[1].id])).rows.length,0);
 await assert.rejects(db.query("insert into report.members(group_id,name,school) values($1,'긴학교',$2)",[group.id,'가'.repeat(51)]));
 // 재적 집계는 활동·새친구만 센다
 assert.equal((await db.query("select count(*)::int n from report.members where group_id=$1 and kind='student' and status in ('active','newcomer')",[group.id])).rows[0].n,0);
}finally{await db.close();}});

test('성찬: 성찬팀은 성찬 준비팀으로 이름만 바뀌고 성찬위원 파트가 예배와 함께 생긴다',async()=>{const db=new PGlite();try{
 const {parent,team}=await legacyCommunion(db,false);
 const service=(await db.query("select id from report.service_types where is_active limit 1")).rows[0];
 await db.exec(readFileSync('supabase/migrations/20261118000000_communion_groups.sql','utf8'));
 assert.equal((await db.query('select name from report.groups where id=$1',[team.id])).rows[0].name,'성찬 준비팀');
 const added=(await db.query("select id,sort_order from report.groups where parent_id=$1 and name='성찬위원'",[parent.id])).rows;
 assert.equal(added.length,1);assert.equal(added[0].sort_order,7);
 assert.equal((await db.query('select count(*)::int n from report.group_service_types where group_id=$1 and service_type_id=$2',[added[0].id,service.id])).rows[0].n,1);
 // 다시 실행해도 중복되지 않는다
 await db.exec(readFileSync('supabase/migrations/20261118000000_communion_groups.sql','utf8'));
 assert.equal((await db.query("select count(*)::int n from report.groups where parent_id=$1 and name in ('성찬위원','성찬 준비팀')",[parent.id])).rows[0].n,2);
}finally{await db.close();}});

test('성찬: 성찬팀과 성찬준비팀이 함께 운영 중이면 성찬팀이 성찬위원이 되고 성찬준비팀은 띄어쓰기만 맞춘다',async()=>{const db=new PGlite();try{
 const {parent,team}=await legacyCommunion(db,true);
 const prep=(await db.query("select id from report.groups where name='성찬준비팀'")).rows[0];
 const service=(await db.query("select id from report.service_types where is_active limit 1")).rows[0];
 for(let i=0;i<2;i++)await db.exec(readFileSync('supabase/migrations/20261118000000_communion_groups.sql','utf8'));
 assert.equal((await db.query('select name from report.groups where id=$1',[team.id])).rows[0].name,'성찬위원');
 assert.equal((await db.query('select name from report.groups where id=$1',[prep.id])).rows[0].name,'성찬 준비팀');
 assert.equal((await db.query("select count(*)::int n from report.groups where parent_id=$1 and name like '%성찬%'",[parent.id])).rows[0].n,2);
 assert.equal((await db.query('select count(*)::int n from report.group_service_types where group_id=$1 and service_type_id=$2',[team.id,service.id])).rows[0].n,1);
}finally{await db.close();}});
