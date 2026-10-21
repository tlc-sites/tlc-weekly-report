import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {SUPABASE_STUB} from './stub.mjs';
test('담당교역자 선택으로 역할·소속 원자적 저장, 실패 롤백 및 자기 승격 차단',async()=>{
 const db=new PGlite();try{await db.exec(SUPABASE_STUB);for(const f of readdirSync('supabase/migrations').sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));await db.exec(readFileSync('supabase/seed.sql','utf8'));
 const ids={};for(const name of ['admin','target','other']){ids[name]=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[ids[name],name+'@example.com']);await db.query("insert into report.profiles(id,status,is_admin,real_name) values($1,'active',$2,$3)",[ids[name],name==='admin',name]);}
 const gid=(await db.query("select id from report.groups where name='음향팀'")).rows[0].id;
 const assignment=[{group_id:gid,position:'담당교역자',role:'reviewer'}];
 async function save(actor,target,rows){return db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[ids[actor]]);return tx.query('select report.set_memberships_with_minister($1,$2::jsonb)',[ids[target],JSON.stringify(rows)]);});}
 await save('admin','target',assignment);assert.equal((await db.query('select is_minister from report.profiles where id=$1',[ids.target])).rows[0].is_minister,true);assert.equal((await db.query('select position from report.memberships where user_id=$1',[ids.target])).rows[0].position,'담당교역자');
 await assert.rejects(save('admin','admin',assignment),/own content/);await assert.rejects(save('target','other',assignment),/forbidden/);
 await assert.rejects(save('admin','other',[...assignment,{group_id:gid,position:'담당교역자',role:'reviewer'}]),/duplicate/);assert.equal((await db.query('select is_minister from report.profiles where id=$1',[ids.other])).rows[0].is_minister,false);assert.equal((await db.query('select count(*)::int n from report.memberships where user_id=$1',[ids.other])).rows[0].n,0);
 assert.equal((await db.query("select has_function_privilege('anon','report.set_memberships_with_minister(uuid,jsonb)','execute') ok")).rows[0].ok,false);
 }finally{await db.close();}
});
