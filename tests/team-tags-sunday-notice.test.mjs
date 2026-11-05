import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {SUPABASE_STUB} from './stub.mjs';
async function setup(){
 const db=new PGlite();
 await db.exec(SUPABASE_STUB);
 for(const f of readdirSync('supabase/migrations').sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
 await db.exec(readFileSync('supabase/seed.sql','utf8'));
 const ids={};
 for(const [n,name,minister,admin] of [['writer','작성자갑',false,false],['pastor','목사을',false,false],['minister','교역자병',true,false],['video','영상정',false,false],['admin','관리무',false,true],['outsider','외부기',false,false]]){
  ids[n]=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[ids[n],n+'@example.com']);
  await db.query("insert into report.profiles(id,real_name,status,recipient_role,is_minister,is_admin) values($1,$2,'active',$3,$4,$5)",[ids[n],name,n==='pastor'?'pastor':null,minister,admin]);
 }
 const g=async name=>(await db.query('select id from report.groups where name=$1',[name])).rows[0].id;
 const sound=await g('음향팀'),video=await g('영상팀');
 await db.query("insert into report.memberships(user_id,group_id,role,position) values($1,$2,'writer','오퍼레이터')",[ids.writer,sound]);
 await db.query("insert into report.memberships(user_id,group_id,role,position) values($1,$2,'reviewer','예배총괄')",[ids.video,video]);
 const as=(n,sql,args=[])=>db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[ids[n]]);return tx.query(sql,args);});
 return {db,ids,sound,video,as};
}
test('목사님·교역자가 보고서를 다른 팀에 태그하면 그 팀이 보고 알림을 받는다',async()=>{
 const {db,ids,sound,video,as}=await setup();try{
 const rid=(await db.query("insert into report.reports(group_id,author_id,author_name,meeting_date,meeting_label,status) values($1,$2,'작성자갑',current_date,'1부 예배','submitted') returning id",[sound,ids.writer])).rows[0].id;
 assert.equal((await as('video','select id from report.reports where id=$1',[rid])).rows.length,0);
 // 일반 팀원·작성자는 태그할 수 없다
 await assert.rejects(as('writer','select report.tag_report_teams($1,$2,$3)',[rid,[video],'x']),/clergy required/);
 assert.equal((await as('pastor','select report.tag_report_teams($1,$2,$3) n',[rid,[video,sound],'다음 주 영상 확인 부탁'])).rows[0].n,1); // 자기 팀(음향)은 빼고 1팀
 assert.equal((await as('video','select id from report.reports where id=$1',[rid])).rows.length,1);
 const inbox=(await as('video','select title,body,report_event_key from report.inbox_notifications')).rows;
 assert.equal(inbox.length,1);assert.equal(inbox[0].title,'목사을님이 영상팀에 보고서를 공유했습니다');assert.match(inbox[0].body,/다음 주 영상 확인 부탁/);assert.ok(inbox[0].report_event_key);
 const tags=(await as('video','select group_id,memo,tagged_by from report.report_team_tags')).rows;
 assert.deepEqual(tags.map(t=>[t.group_id,t.memo,t.tagged_by]),[[video,'다음 주 영상 확인 부탁',ids.pastor]]);
 assert.equal((await as('outsider','select * from report.report_team_tags')).rows.length,0);
 // 교역자도 태그 가능, 다시 태그하면 메모가 바뀌고 다시 알린다
 await as('minister','select report.tag_report_teams($1,$2,$3)',[rid,[video],'메모 수정']);
 assert.equal((await as('video','select memo from report.report_team_tags')).rows[0].memo,'메모 수정');
 // 작성자가 보고서를 고쳐도(멘션 동기화) 태그는 남는다
 await db.query("update report.reports set details=jsonb_build_object('mentions','[]'::jsonb) where id=$1",[rid]);
 assert.equal((await as('video','select id from report.reports where id=$1',[rid])).rows.length,1);
 // 직접 넣기는 막혀 있다
 await assert.rejects(as('pastor',"insert into report.report_team_tags(report_id,group_id,tagged_by) values($1,$2,$3)",[rid,video,ids.pastor]),/permission denied/);
 // 임시저장 보고는 태그할 수 없다
 const draft=(await db.query("insert into report.reports(group_id,author_id,author_name,meeting_date,meeting_label,status) values($1,$2,'작성자갑',current_date,'2부 예배','draft') returning id",[sound,ids.writer])).rows[0].id;
 await assert.rejects(as('pastor','select report.tag_report_teams($1,$2,$3)',[draft,[video],'']),/not taggable/);
 // 태그 빼기
 await assert.rejects(as('writer','select report.untag_report_team($1,$2)',[rid,video]),/clergy required/);
 await as('pastor','select report.untag_report_team($1,$2)',[rid,video]);
 assert.equal((await as('video','select id from report.reports where id=$1',[rid])).rows.length,0);
 }finally{await db.close();}
});
test('이번 주 공지는 교역자·관리자만 쓰고 모두가 본다',async()=>{
 const {db,ids,as}=await setup();try{
 const sunday='2026-11-08';
 await assert.rejects(as('writer',"insert into report.sunday_notices(sunday,body) values($1,'x')",[sunday]),/row-level/);
 await as('minister',"insert into report.sunday_notices(sunday,body) values($1,'이번 주는 성찬 주일입니다')",[sunday]);
 await assert.rejects(as('admin',"insert into report.sunday_notices(sunday,body) values('2026-11-09','월요일')"),/check/);
 const row=(await as('writer','select body,author_id,updated_by from report.sunday_notices')).rows[0];
 assert.equal(row.body,'이번 주는 성찬 주일입니다');assert.equal(row.author_id,ids.minister);
 await as('admin',"update report.sunday_notices set body='영상 광고 없습니다' where sunday=$1",[sunday]);
 const after=(await as('outsider','select body,author_id,updated_by from report.sunday_notices')).rows[0];
 assert.deepEqual([after.body,after.author_id,after.updated_by],['영상 광고 없습니다',ids.minister,ids.admin]);
 assert.equal((await as('writer',"update report.sunday_notices set body='바꿈' where sunday=$1 returning sunday",[sunday])).rows.length,0);
 await db.query("update report.profiles set status='disabled' where id=$1",[ids.outsider]);
 assert.equal((await as('outsider','select * from report.sunday_notices')).rows.length,0);
 }finally{await db.close();}
});
