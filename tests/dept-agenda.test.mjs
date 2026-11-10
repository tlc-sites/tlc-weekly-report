import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {SUPABASE_STUB} from './stub.mjs';

test('부서 안건방: 두 분이 올리고, 그 부서 총괄·부장·팀장·담당 교역자만 보고 답글, 알림은 정해진 분에게',async()=>{
 const db=new PGlite();try{
 await db.exec(SUPABASE_STUB);for(const f of readdirSync('supabase/migrations').sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
 const ids={};
 const people={pastor:['pastor',false],wife:['pastor_wife',false],eduMin:[null,true],eduLead:[null,false],teacher:[null,false],otherLead:[null,false],admin:[null,false],etcMin:[null,true]};
 for(const [n,[role,minister]] of Object.entries(people)){ids[n]=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[ids[n],n+'@example.com']);await db.query('insert into report.profiles(id,real_name,status,is_admin,is_minister,recipient_role) values($1,$2,$3,$4,$5,$6)',[ids[n],n,'active',n==='admin',minister,role]);}
 const edu=(await db.query("insert into report.groups(type,name) values('education','교육부') returning id")).rows[0].id;
 const kids=(await db.query("insert into report.groups(type,name,parent_id) values('education','유치부',$1) returning id",[edu])).rows[0].id;
 const other=(await db.query("insert into report.groups(type,name) values('other','다른 부서') returning id")).rows[0].id;
 await db.query("insert into report.memberships(user_id,group_id,role,position) values($1,$2,'reviewer','교역자'),($3,$4,'reviewer','총괄'),($5,$2,'writer',null),($6,$7,'reviewer','총괄'),($8,$2,'writer','기타 교역자')",
  [ids.eduMin,kids,ids.eduLead,edu,ids.teacher,ids.otherLead,other,ids.etcMin]);
 async function as(n,sql,args=[]){return db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[ids[n]]);return tx.query(sql,args);});}
 const inbox=async(n)=>(await as(n,"select title,url,agenda_id from report.inbox_notifications where agenda_id is not null order by created_at")).rows;
 const names=async(sql,args)=>{const r=(await db.query(sql,args)).rows;const by=Object.fromEntries(Object.entries(ids).map(([k,v])=>[v,k]));return r.map(x=>by[x.user_id]).sort();};

 // 1) 두 분만 올린다(글자 수 상한 없음, 빈 글은 막음, 상태 칸은 직접 못 넣음)
 const a1=(await as('pastor',"insert into report.agenda_items(group_id,author_id,title,body) values($1,$2,'유치부 교사 수급',$3) returning id",[kids,ids.pastor,'가'.repeat(12000)])).rows[0].id;
 for(const n of ['eduMin','eduLead','teacher','admin'])await assert.rejects(as(n,"insert into report.agenda_items(group_id,author_id,title,body) values($1,$2,'제목','내용')",[kids,ids[n]]),/row-level/);
 await assert.rejects(as('wife',"insert into report.agenda_items(group_id,author_id,title,body) values($1,$2,'제목','  ')",[kids,ids.wife]),/check constraint/);
 await assert.rejects(as('wife',"insert into report.agenda_items(group_id,author_id,title,body,status) values($1,$2,'제목','내용','done')",[kids,ids.wife]),/permission denied/);

 // 2) 보는 분: 두 분 + 담당 교역자 + 상위 부서 총괄. 팀원·기타 교역자·다른 부서·관리자는 못 봄
 for(const n of ['pastor','wife','eduMin','eduLead'])assert.equal((await as(n,'select id from report.agenda_items')).rows.length,1,n);
 for(const n of ['teacher','otherLead','admin','etcMin'])assert.equal((await as(n,'select id from report.agenda_items')).rows.length,0,n);
 for(const [n,want] of [['pastor',true],['eduLead',true],['eduMin',true],['teacher',false],['admin',false],['etcMin',false]])assert.equal((await as(n,'select report.agenda_visible() v')).rows[0].v,want,n);

 // 3) 새 안건 알림: 올린 분 빼고 보는 분 모두. 본문은 알림에 넣지 않음
 assert.deepEqual(await names("select user_id from report.inbox_notifications where agenda_id=$1",[a1]),['eduLead','eduMin','wife']);
 const n1=(await inbox('eduMin'))[0];assert.equal(n1.url,'/agenda/'+a1);assert.ok(!JSON.stringify(n1).includes('가가가'));
 assert.equal((await inbox('teacher')).length,0);

 // 4) 총괄의 답글 → 두 분에게만(아직 답글 안 단 담당 교역자는 빼고). 마지막 활동 시각도 바뀜
 await db.query('delete from report.inbox_notifications');
 const before=(await db.query('select last_activity_at t from report.agenda_items where id=$1',[a1])).rows[0].t;
 await as('eduLead',"insert into report.agenda_replies(agenda_id,author_id,body) values($1,$2,'교사 두 분 추천드립니다')",[a1,ids.eduLead]);
 assert.deepEqual(await names('select user_id from report.inbox_notifications'),['pastor','wife']);
 assert.ok((await db.query('select last_activity_at t from report.agenda_items where id=$1',[a1])).rows[0].t>=before);
 for(const n of ['teacher','otherLead','admin'])await assert.rejects(as(n,"insert into report.agenda_replies(agenda_id,author_id,body) values($1,$2,'무단')",[a1,ids[n]]),/row-level/);
 assert.equal((await as('teacher','select id from report.agenda_replies')).rows.length,0);

 // 5) 두 분의 답글 → 보는 분 모두에게
 await db.query('delete from report.inbox_notifications');
 await as('wife',"insert into report.agenda_replies(agenda_id,author_id,body) values($1,$2,'좋습니다. 다음 주에 같이 이야기해요')",[a1,ids.wife]);
 assert.deepEqual(await names('select user_id from report.inbox_notifications'),['eduLead','eduMin','pastor']);
 // 담당 교역자 답글 → 두 분 + 앞서 답글 단 총괄
 await db.query('delete from report.inbox_notifications');
 await as('eduMin',"insert into report.agenda_replies(agenda_id,author_id,body) values($1,$2,'확인했습니다')",[a1,ids.eduMin]);
 assert.deepEqual(await names('select user_id from report.inbox_notifications'),['eduLead','pastor','wife']);

 // 6) 상태는 두 분만
 await assert.rejects(as('eduMin','select report.set_agenda_status($1,true)',[a1]),/담임 목사님/);
 await as('wife','select report.set_agenda_status($1,true)',[a1]);
 assert.equal((await db.query('select status from report.agenda_items where id=$1',[a1])).rows[0].status,'done');
 await assert.rejects(as('eduLead',"update report.agenda_items set status='open' where id=$1",[a1]),/permission denied/);

 // 7) 상위 부서(교육부)에 올린 안건은 하위 파트 담당 교역자도 봄
 const a2=(await as('wife',"insert into report.agenda_items(group_id,author_id,title,body) values($1,$2,'교육부 전체','내용') returning id",[edu,ids.wife])).rows[0].id;
 assert.equal((await as('eduMin','select id from report.agenda_items where id=$1',[a2])).rows.length,1);

 // 8) 지우기는 올린 분만, 지우면 답글·알림도 함께
 await as('wife','delete from report.agenda_items where id=$1',[a1]);
 assert.equal((await db.query('select count(*)::int n from report.agenda_items where id=$1',[a1])).rows[0].n,1,'다른 분이 올린 안건은 안 지워짐');
 await as('pastor','delete from report.agenda_items where id=$1',[a1]);
 assert.equal((await db.query('select count(*)::int n from report.agenda_replies')).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int n from report.inbox_notifications where agenda_id=$1',[a1])).rows[0].n,0);

 // 9) 다시 실행해도 안전
 await db.exec(readFileSync('supabase/migrations/20261216000000_dept_agenda.sql','utf8'));
 assert.equal((await as('eduMin','select id from report.agenda_items')).rows.length,1);
 }finally{await db.close();}
});
