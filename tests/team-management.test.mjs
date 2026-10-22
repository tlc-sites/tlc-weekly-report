import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {SUPABASE_STUB} from './stub.mjs';
test('사진팀 분류 보정 및 담당교역자 명단 수정·타교역자 차단',async()=>{const db=new PGlite();try{
 await db.exec(SUPABASE_STUB);for(const f of readdirSync('supabase/migrations').sort().filter(f=>f<'20261108000000'))await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));await db.exec(readFileSync('supabase/seed.sql','utf8'));
 const group=(await db.query("select id,name from report.groups where name='사진팀'")).rows[0];const ids=[randomUUID(),randomUUID()];for(const id of ids){await db.query('insert into auth.users(id,email) values($1,$2)',[id,id+'@example.com']);await db.query("insert into report.profiles(id,status,is_minister) values($1,'active',true)",[id]);}await db.query("insert into report.memberships(user_id,group_id,role,position) values($1,$2,'reviewer','담당교역자')",[ids[0],group.id]);
 const member=(await db.query("insert into report.team_directory(group_id,name,duty,created_by) values($1,'기존 팀원','사진',$2) returning id",[group.id,ids[0]])).rows[0];await db.query("update report.groups set type='other' where id=$1",[group.id]);await db.exec(readFileSync('supabase/migrations/20261108000000_photo_worship_category.sql','utf8'));assert.equal((await db.query('select type from report.groups where id=$1',[group.id])).rows[0].type,'worship');assert.equal((await db.query('select name from report.team_directory where id=$1',[member.id])).rows[0].name,'기존 팀원');assert.equal((await db.query('select count(*)::int n from report.memberships where group_id=$1',[group.id])).rows[0].n,1);
 async function as(id,sql,args){return db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);return tx.query(sql,args);});}
 assert.equal((await as(ids[0],"update report.team_directory set name='수정 팀원',duty='촬영' where id=$1 returning name",[member.id])).rows[0].name,'수정 팀원');assert.equal((await as(ids[1],"update report.team_directory set name='외부 수정' where id=$1 returning id",[member.id])).rows.length,0);assert.equal((await as(ids[1],'select * from report.team_directory where id=$1',[member.id])).rows.length,0);assert.equal((await db.query('select name from report.team_directory where id=$1',[member.id])).rows[0].name,'수정 팀원');
 }finally{await db.close();}});
