import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {SUPABASE_STUB} from './stub.mjs';

test('중등부 ↔ 고등부 가져오기: 같은 날 상대 부서 제출 보고의 설교·공과 네 칸만, 고칠 수 있는 사람에게만',async()=>{const db=new PGlite();try{
 await db.exec(SUPABASE_STUB);for(const f of readdirSync('supabase/migrations').sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));await db.exec(readFileSync('supabase/seed.sql','utf8'));
 const gid=async name=>(await db.query("select id from report.groups where name=$1 and is_active",[name])).rows[0].id;
 const [mid,hi,kinder]=[await gid('중등부'),await gid('고등부'),await gid('유치부')];
 const user=async(name,group)=>{const id=randomUUID();await db.query("insert into auth.users(id,email) values($1,$2)",[id,id+'@x.com']);await db.query("insert into report.profiles(id,real_name,status) values($1,$2,'active')",[id,name]);
  if(group){const pos=(await db.query("select title from report.positions_for_group($1) where member_role='writer' and not is_clergy limit 1",[group])).rows[0]?.title??null;await db.query("insert into report.memberships(user_id,group_id,role,position) values($1,$2,'writer',$3)",[id,group,pos]);}return id;};
 const [hiT,midT,midT2,outsider,kT]=[await user('고등부 교사',hi),await user('중등부 교사',mid),await user('중등부 교사2',mid),await user('외부'),await user('유치부 교사',kinder)];
 const day='2026-11-15';
 const rep=async(group,author,status,details)=>(await db.query("insert into report.reports(group_id,author_id,author_name,meeting_date,meeting_label,status,submitted_at,details) values($1,$2,'작성자',$3,'주일예배',$4,$5,$6) returning id",[group,author,day,status,status==='draft'?null:new Date().toISOString(),JSON.stringify(details)])).rows[0].id;
 const as=(uid,rid)=>db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[uid]);return (await tx.query("select * from report.sibling_sermon($1)",[rid])).rows;});
 const myHi=await rep(hi,hiT,'draft',{});
 // 상대 부서 보고가 아직 없음
 assert.deepEqual(await as(hiT,myHi),[]);
 // 남이 쓰던 임시저장은 가져오지 않는다
 await rep(mid,midT2,'draft',{sermon_passage:'임시'});
 assert.deepEqual(await as(hiT,myHi),[]);
 await rep(mid,midT,'submitted',{sermon_passage:'요 3:16',preacher:'김목사',sermon_summary:'사랑',activity:'공과 1과',notes:'비밀 특이사항',requests:[{category:'시설',content:'x'}]});
 const got=await as(hiT,myHi);
 assert.deepEqual(got.map(r=>[r.from_group,r.sermon_passage,r.preacher,r.sermon_summary,r.activity]),[['중등부','요 3:16','김목사','사랑','공과 1과']]);
 // 돌려주는 칸은 이 여섯 개뿐(특이사항·요청사항·출결 없음)
 assert.deepEqual(Object.keys(got[0]).sort(),['activity','from_group','meeting_date','preacher','sermon_passage','sermon_summary']);
 // 반대 방향도 된다
 await db.query("update report.reports set status='submitted',submitted_at=now(),details=$2 where id=$1",[myHi,JSON.stringify({sermon_passage:'롬 8:28'})]);
 const myMid=await rep(mid,midT,'draft',{});
 assert.equal((await as(midT,myMid))[0].sermon_passage,'롬 8:28');
 // 이 보고를 고칠 수 없는 사람, 중등부·고등부가 아닌 부서는 빈 결과
 assert.deepEqual(await as(outsider,myHi),[]);
 assert.deepEqual(await as(hiT,myMid),[]);
 const kRep=await rep(kinder,kT,'draft',{});
 assert.deepEqual(await as(kT,kRep),[]);
}finally{await db.close();}});
