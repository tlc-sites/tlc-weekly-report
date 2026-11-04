import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {SUPABASE_STUB} from './stub.mjs';

test('관리자는 예배/기술팀 명단을 보고 추가·수정할 수 있고, 교회학교 명단과 삭제 권한은 그대로다',async()=>{const db=new PGlite();try{
 await db.exec(SUPABASE_STUB);for(const f of readdirSync('supabase/migrations').sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));await db.exec(readFileSync('supabase/seed.sql','utf8'));
 const ids={};for(const [n,admin] of [['admin',true],['other',false],['inactiveAdmin',true]]){ids[n]=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[ids[n],n+'@example.com']);await db.query('insert into report.profiles(id,real_name,status,is_admin) values($1,$2,$3,$4)',[ids[n],n,n==='inactiveAdmin'?'disabled':'active',admin]);}
 const team=(await db.query("select id from report.groups where name='예배팀'")).rows[0].id,school=(await db.query("select id from report.groups where name='중등부'")).rows[0].id;
 const as=(n,sql,args=[])=>db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[ids[n]]);return tx.query(sql,args);});
 const add=(n,g,kind='teacher')=>as(n,"insert into report.members(group_id,name,kind,team_position,status) values($1,'새 팀원',$2,'팀원','active') returning id",[g,kind]);
 const student=(await db.query("insert into report.members(group_id,name,kind,status) values($1,'학생','student','active') returning id",[school])).rows[0].id;

 assert.equal((await as('admin','select report.can_view_roster($1) v',[team])).rows[0].v,true);
 const mid=(await add('admin',team)).rows[0].id;
 assert.equal((await as('admin','select name from report.members where group_id=$1',[team])).rows.length,1);
 assert.equal((await as('admin',"update report.members set team_position='팀장' where id=$1 returning team_position",[mid])).rows[0].team_position,'팀장');
 // 삭제는 기존대로 최상단만
 assert.equal((await as('admin','delete from report.members where id=$1 returning id',[mid])).rows.length,0);

 // 교회학교 명단은 관리자에게 여전히 닫혀 있다
 assert.equal((await as('admin','select report.can_view_roster($1) v',[school])).rows[0].v,false);
 assert.equal((await as('admin','select id from report.members where id=$1',[student])).rows.length,0);
 await assert.rejects(add('admin',school,'student'),/row-level/);
 await assert.rejects(add('admin',school),/row-level/);
 // 예배/기술팀 안의 학생 구분 행(보호자 정보가 붙을 수 있음)은 관리자에게 보이지 않는다
 const teamStudent=(await db.query("insert into report.members(group_id,name,kind,status) values($1,'학생행','student','active') returning id",[team])).rows[0].id;
 assert.equal((await as('admin','select id from report.members where id=$1',[teamStudent])).rows.length,0);
 // 예배/기술팀이어도 학생 구분으로는 넣을 수 없다
 await assert.rejects(add('admin',team,'student'),/row-level/);

 // 관리자가 아니거나 비활성 관리자는 못 본다
 for(const n of ['other','inactiveAdmin']){
  assert.equal((await as(n,'select id from report.members where group_id=$1',[team])).rows.length,0);
  await assert.rejects(add(n,team),/row-level/);
 }
}finally{await db.close();}});
