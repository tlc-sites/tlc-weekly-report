import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {SUPABASE_STUB} from './stub.mjs';

// DB47: 셀케어 명단에 없는 분도 이 앱에서 가입 신청하면 로그인 계정이 만들어지고, 그 밖의 이메일은 지금처럼 막힌다.
test('보고 앱 자체 가입: 신청한 이메일만 셀케어 가입 차단을 통과한다',async()=>{const db=new PGlite();try{
 await db.exec(SUPABASE_STUB);
 for(const f of readdirSync('supabase/migrations').sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
 await db.exec('create trigger gate before insert on auth.users for each row execute function private.gate_new_auth_user()');
 const newUser=email=>db.query('insert into auth.users(id,email) values($1,$2)',[randomUUID(),email]);
 const as=role=>(sql,args=[])=>db.transaction(async tx=>{await tx.exec('set local role '+role);return tx.query(sql,args);});
 // 가입 신청은 로그인 화면의 서버 액션이 service_role로 부른다
 const server=as('service_role'),anon=as('anon'),user=as('authenticated');
 const blocked=async email=>{await assert.rejects(newUser(email),/CELLCARE_NOT_APPROVED/);};

 // 셀케어 명단의 이메일은 그대로 통과, 모르는 이메일은 그대로 막힘
 await db.query("insert into public.profiles(name,email) values('셀리더','Leader@Example.com'),('그만둔분','gone@example.com')");
 await db.query("update public.profiles set active=false where email='gone@example.com'");
 await newUser('leader@example.com');
 await blocked('stranger@example.com');
 await blocked('gone@example.com');

 // 가입 신청하면 그 이메일로 계정이 만들어진다(대소문자·공백 무시)
 assert.equal((await server("select report.request_signup('  New.Person@Example.com ') r")).rows[0].r,'ok');
 await newUser('new.person@example.com');
 // 같은 이메일을 다시 신청해도 한 줄만 남는다
 await server("select report.request_signup('new.person@example.com')");
 assert.equal((await db.query("select count(*)::int n from report.signup_requests")).rows[0].n,1);

 // 로그인 전·후 사용자는 신청 함수도 신청 목록도 직접 쓸 수 없다
 await assert.rejects(anon("select report.request_signup('x@example.com')"),/permission denied/);
 await assert.rejects(user("select report.request_signup('x@example.com')"),/permission denied/);
 await assert.rejects(user('select * from report.signup_requests'),/permission denied/);
 await assert.rejects(user("insert into report.signup_requests(email) values('x@example.com')"),/permission denied/);

 // 거절된 이메일은 다시 신청해도 막힌다
 await server("select report.request_signup('spam@example.com')");
 await db.query("update report.signup_requests set status='rejected' where email='spam@example.com'");
 await server("select report.request_signup('spam@example.com')");
 await blocked('spam@example.com');

 // 잘못된 이메일은 거부
 await assert.rejects(server("select report.request_signup('not-an-email')"),/invalid email/);
 await assert.rejects(server("select report.request_signup('a b@example.com')"),/invalid email/);

 // 1시간 30건이 넘으면 잠시 막힌다(이미 신청한 이메일의 재신청은 영향 없음)
 for(let i=0;i<28;i++)await server('select report.request_signup($1)',[`bulk${i}@example.com`]);
 await assert.rejects(server("select report.request_signup('one-more@example.com')"),/too many/);
 assert.equal((await server("select report.request_signup('new.person@example.com') r")).rows[0].r,'ok');

 // 가입 신청만으로는 셀케어 명단에 들어가지 않는다
 assert.equal((await db.query("select count(*)::int n from public.profiles where lower(email)='new.person@example.com'")).rows[0].n,0);
}finally{await db.close();}});
