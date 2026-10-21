import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {SUPABASE_STUB} from './stub.mjs';
test('운영 합본 SQL 전체 실행·기존 행 보존·중복 적용 차단',async()=>{const db=new PGlite();try{await db.exec(SUPABASE_STUB);for(const f of readdirSync('supabase/migrations').sort().filter(f=>f<'20261105000000'))await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));await db.exec(readFileSync('supabase/seed.sql','utf8'));const before=(await db.query('select to_jsonb(g) row from report.groups g order by id')).rows;const sql=readFileSync('scripts/apply-db22-db23.sql','utf8');await db.exec(sql);for(const r of before)assert.equal((await db.query('select count(*)::int n from report.groups g where to_jsonb(g) @> $1::jsonb',[JSON.stringify(r.row)])).rows[0].n,1);assert.equal((await db.query("select count(*)::int n from pg_tables where schemaname='report' and tablename in('internship_participants','internship_attendance','prayer_meeting_comments','weekly_email_deliveries') and rowsecurity")).rows[0].n,4);await assert.rejects(db.exec(sql),/already present/);}finally{await db.close();}});
