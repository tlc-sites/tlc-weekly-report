import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {SUPABASE_STUB} from './stub.mjs';

test('작성자는 제출한 보고의 모임 날짜를 하루 앞으로 옮길 수 있고, 주차도 따라 바뀐다',async()=>{const db=new PGlite();try{
 await db.exec(SUPABASE_STUB);for(const f of readdirSync('supabase/migrations').sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));await db.exec(readFileSync('supabase/seed.sql','utf8'));
 const writer=randomUUID();await db.query("insert into auth.users(id,email) values($1,'w@example.com')",[writer]);await db.query("insert into report.profiles(id,real_name,status) values($1,'작성자','active')",[writer]);
 const team=(await db.query("select id from report.groups where type='other' and parent_id is null and is_active order by name limit 1")).rows[0].id;
 const pos=(await db.query("select title from report.positions_for_group($1) where member_role='writer' limit 1",[team])).rows[0].title;
 await db.query("insert into report.memberships(user_id,group_id,role,position) values($1,$2,'writer',$3)",[writer,team,pos]);
 const as=(sql,args=[])=>db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[writer]);return tx.query(sql,args);});
 // 2026-11-02(월)에 쓴 보고를 전날인 일요일 11-01로 옮기면 주차도 11-01 주로 바뀐다
 const r=(await as("insert into report.reports(group_id,author_id,author_name,meeting_date,meeting_label,status) values($1,$2,'작성자','2026-11-02','전체 모임','submitted') returning id,week::text",[team,writer])).rows[0];
 assert.equal(r.week,'2026-11-01');
 const moved=(await as("update report.reports set meeting_date='2026-10-31' where id=$1 returning meeting_date::text,week::text,status",[r.id])).rows[0];
 assert.deepEqual(moved,{meeting_date:'2026-10-31',week:'2026-10-25',status:'submitted'});
 // 미래 날짜는 트리거가 막는다
 await assert.rejects(as("update report.reports set meeting_date=current_date+1 where id=$1",[r.id]),/미래 날짜/);
 // 확인 처리된 보고는 작성자가 바꿀 수 없다
 await db.query("update report.reports set status='reviewed' where id=$1",[r.id]);
 const none=await as("update report.reports set meeting_date='2026-10-30' where id=$1 returning id",[r.id]);
 assert.equal(none.rows.length,0);
}finally{await db.close();}});
