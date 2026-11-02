import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {SUPABASE_STUB} from './stub.mjs';
test('모임 없음 사유: 1000자까지 저장, 넘으면 거부, 길이 제약은 하나만',async()=>{const db=new PGlite();try{
 await db.exec(SUPABASE_STUB);for(const f of readdirSync('supabase/migrations').sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
 const checks=(await db.query("select conname from pg_constraint where conrelid='report.week_status'::regclass and contype='c' and pg_get_constraintdef(oid) like '%char_length(reason)%'")).rows;
 assert.deepEqual(checks,[{conname:'week_status_reason_check'}]);
 const group=(await db.query("select id from report.groups where is_active limit 1")).rows[0].id;
 const week=(await db.query("select (current_date-extract(dow from current_date)::int-7)::text w")).rows[0].w;
 const save=reason=>db.query("insert into report.week_status(group_id,week,no_meeting,reason) values($1,$2,true,$3) on conflict(group_id,week) do update set reason=excluded.reason",[group,week,reason]);
 await save('팀원 개인 일정들 겹침\n- 김기윤: 셀\n'+'가'.repeat(900));
 await save('가'.repeat(1000));
 await assert.rejects(save('가'.repeat(1001)),/week_status_reason_check/);
}finally{await db.close();}});
