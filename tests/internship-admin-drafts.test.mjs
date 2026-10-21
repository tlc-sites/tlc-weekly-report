import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {SUPABASE_STUB} from './stub.mjs';
test('반별 출결·관리자 타인 교역자 지정·두 분 관리·초안과 이슈 보존',async()=>{
 const db=new PGlite();try{
 await db.exec(SUPABASE_STUB);const files=readdirSync('supabase/migrations').sort();for(const f of files.filter(f=>f<'20261105000000'))await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));await db.exec(readFileSync('supabase/seed.sql','utf8'));
 const ids={};for(const n of ['admin','teacher','other','wife','writer','pending']){ids[n]=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[ids[n],n+'@example.com']);await db.query('insert into report.profiles(id,real_name,status,is_admin,is_minister,recipient_role) values($1,$2,$3,$4,$5,$6)',[ids[n],n,n==='pending'?'pending':'active',n==='admin',n==='teacher',n==='wife'?'pastor_wife':null]);}
 const parent=(await db.query("select id from report.groups where name='스데반 인턴십'")).rows[0].id;await db.query("insert into report.memberships(user_id,group_id,role,position) values($1,$2,'reviewer','담당교역자')",[ids.teacher,parent]);
 const legacy=(await db.query("insert into report.reports(group_id,author_id,author_name,meeting_date,meeting_label) values($1,$2,'교역자',current_date,'기존 인턴십') returning to_jsonb(reports) row",[parent,ids.teacher])).rows[0].row;
 for(const f of files.filter(f=>f>='20261105000000'))await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
 assert.deepEqual((await db.query('select to_jsonb(r) row from report.reports r where id=$1',[legacy.id])).rows[0].row,legacy);
 const classes=(await db.query("select id,name from report.groups where parent_id=$1 order by sort_order",[parent])).rows;assert.deepEqual(classes.map(c=>c.name),['A반','B반','목요반']);const a=classes[0].id,b=classes[1].id;
 async function as(n,sql,args=[]){return db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[ids[n]]);return tx.query(sql,args);});}
 await as('admin','select report.set_minister($1,true)',[ids.other]);assert.equal((await db.query('select is_minister from report.profiles where id=$1',[ids.other])).rows[0].is_minister,true);
 await assert.rejects(as('admin','select report.set_minister($1,true)',[ids.admin]),/forbidden/);
 await assert.rejects(as('teacher','select report.set_minister($1,true)',[ids.writer]),/forbidden/);
 await assert.rejects(as('admin',"select report.set_recipient_role($1,'pastor')",[ids.other]),/senior permission/);
 await as('wife','select report.set_minister($1,true)',[ids.writer]);
 await as('admin','select report.approve_minister_user($1,$2::jsonb,false)',[ids.pending,JSON.stringify([{group_id:b,role:'reviewer',position:'담당교역자'}])]);assert.equal((await db.query('select status,is_minister from report.profiles where id=$1',[ids.pending])).rows[0].status,'active');
 const person=(await as('teacher',"insert into report.internship_participants(group_id,name,created_by) values($1,'참여자',$2) returning id",[a,ids.teacher])).rows[0].id;
 assert.equal((await as('teacher','select report.can_manage_internship($1) ok',[b])).rows[0].ok,true,'상위 담당 상속');
 await assert.rejects(as('other',"insert into report.internship_participants(group_id,name,created_by) values($1,'외부',$2)",[a,ids.other]),/row-level/);
 const date=(await db.query('select current_date::text d')).rows[0].d;
 await as('teacher','select report.save_internship_attendance($1,$2,$3::jsonb)',[a,date,JSON.stringify([{participant_id:person,mark:'present',note:'확인'}])]);
 await assert.rejects(as('teacher','select report.save_internship_attendance($1,$2,$3::jsonb)',[b,date,JSON.stringify([{participant_id:person,mark:'absent'}])]),/roster|participant/);
 await assert.rejects(as('teacher','select report.save_internship_attendance($1,current_date+1,$2::jsonb)',[a,JSON.stringify([{participant_id:person,mark:'absent'}])]),/invalid attendance date/);
 await as('teacher','update report.internship_participants set is_active=false where id=$1',[person]);assert.equal((await as('teacher','select * from report.internship_attendance')).rows[0].participant_name,'참여자');
 const sound=(await db.query("select id from report.groups where name='음향팀'")).rows[0].id;
 await db.query("insert into report.memberships(user_id,group_id,role,position) values($1,$2,'writer','오퍼레이터')",[ids.admin,sound]);
 const draft=(await as('admin',"insert into report.reports(group_id,author_id,author_name,meeting_date,meeting_label) values($1,$2,'관리자',current_date,'초안') returning id",[sound,ids.admin])).rows[0].id;
 await db.query("insert into report.memberships(user_id,group_id,role,position) values($1,$2,'writer','오퍼레이터')",[ids.writer,sound]);
 const issue=(await as('admin',"insert into report.worship_incidents(author_id,report_id,group_ids,occurred_on,service_name,title,circumstances) values($1,$2,$3,current_date,'예배','보존할 이슈','내용 보존') returning id",[ids.admin,draft,[sound]])).rows[0].id;
 await assert.rejects(as('admin','update report.worship_incidents set report_id=null where id=$1',[issue]),/immutable/);
 await db.query('delete from report.memberships where user_id=$1',[ids.admin]);
 await as('admin','delete from report.reports where id=$1',[draft]);
 const kept=(await db.query('select report_id,circumstances from report.worship_incidents where id=$1',[issue])).rows[0];assert.equal(kept.report_id,null);assert.equal(kept.circumstances,'내용 보존');
 assert.equal((await as('wife','select report.is_admin() ok')).rows[0].ok,true);
 }finally{await db.close();}
});
