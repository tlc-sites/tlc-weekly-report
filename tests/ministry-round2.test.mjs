import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {SUPABASE_STUB} from './stub.mjs';
import {rehearsalTotals} from '../src/lib/rehearsals.ts';
import {groupIncidentEvents} from '../src/lib/incident-events.ts';
const db=new PGlite(),id={};
const deny=p=>assert.rejects(p,/permission|forbidden|row-level|team|source|future|duplicate|report kind|original author/i);
async function as(user,sql,args=[]){return db.transaction(async tx=>{await tx.exec(`set local role ${user==='service'?'service_role':user?'authenticated':'anon'}`);if(user&&user!=='service')await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);return tx.query(sql,args)});}
before(async()=>{
 await db.exec(SUPABASE_STUB);const dir=join(import.meta.dirname,'..','supabase');const files=readdirSync(join(dir,'migrations')).sort();
 for(const f of files.filter(f=>f<'20261029000000'))await db.exec(readFileSync(join(dir,'migrations',f),'utf8'));
 await db.exec(readFileSync(join(dir,'seed.sql'),'utf8'));
 for(const name of ['senior','ministerA','ministerB','leadA','leadB','writerA','writerB','admin','pending']){
  id[name]=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[id[name],`${name}@example.com`]);
  await db.query('insert into report.profiles(id,real_name,status,is_admin,is_minister,recipient_role) values($1,$2,$3,$4,$5,$6)',[id[name],name,name==='pending'?'pending':'active',name==='admin',name.startsWith('minister'),name==='senior'?'pastor':null]);
 }
 for(const [key,name]of [['a','중등부'],['b','초등부'],['sound','음향팀'],['video','영상팀']])id[key]=(await db.query('select id from report.groups where name=$1',[name])).rows[0].id;
 for(const side of ['A','B'])for(const role of ['minister','lead','writer']){
  for(const group of side==='A'?[id.a,id.sound]:[id.b,id.video])await db.query('insert into report.memberships(user_id,group_id,role) values($1,$2,$3)',[id[role+side],group,role==='writer'?'writer':'reviewer']);
  const rid=randomUUID();id['r'+role+side]=rid;await db.query("insert into report.reports(id,group_id,author_id,author_name,meeting_date,meeting_label,details) values($1,$2,$3,$4,current_date,'모임','{\"notes\":\"보존\"}')",[rid,side==='A'?id.a:id.b,id[role+side],role+side]);
 }
 await db.query("insert into report.report_prayers(report_id,body) values($1,'기도제목')",[id.rministerB]);
 id.child=randomUUID();await db.query("insert into report.members(id,group_id,name) values($1,$2,'학생')",[id.child,id.b]);
 await db.query("insert into report.member_guardians(member_id,slot,name,contact,consent) values($1,1,'보호자','000-0000',true)",[id.child]);
 for(const key of ['staff1','staff2','foreignStaff']){id[key]=randomUUID();await db.query("insert into report.members(id,group_id,name,kind) values($1,$2,$3,'teacher')",[id[key],key==='foreignStaff'?id.video:id.sound,key]);}
 const source=(await db.query("select id,details,updated_at,last_edited_by from report.reports order by id")).rows;
 for(const f of files.filter(f=>f>='20261029000000'))await db.exec(readFileSync(join(dir,'migrations',f),'utf8'));
 assert.deepEqual((await db.query("select id,details,updated_at,last_edited_by from report.reports order by id")).rows,source);
});
after(()=>db.close());
test('같은 직급 작성 보고는 다른 파트에서도 읽되 다른 직급·개인정보는 범위 밖에 공개하지 않는다',async()=>{
 for(const role of ['minister','lead','writer'])assert.equal((await as(id[role+'A'],'select id from report.reports where id=$1',[id['r'+role+'B']])).rows.length,1,role);
 assert.equal((await as(id.writerA,'select id from report.reports where id=$1',[id.rleadB])).rows.length,0);
 assert.equal((await as(id.admin,'select id from report.reports')).rows.length,0);
 assert.equal((await as(id.ministerA,'select * from report.report_prayers')).rows.length,0);
 assert.equal((await as(id.leadA,'select * from report.member_guardians')).rows.length,0);
 assert.equal((await as(id.ministerA,'select id from report.members where group_id=$1',[id.b])).rows.length,0);
 assert.equal((await as(id.ministerA,'update report.reports set details=details where id=$1 returning id',[id.rministerB])).rows.length,0);
 assert.equal((await as(id.ministerA,'select report.can_review_report($1) ok',[id.rministerB])).rows[0].ok,false);
 await as(id.writerA,"update report.reports set author_layer=4,details='{\"_report_meta\":{\"author_name\":\"위조\"}}' where id=$1",[id.rwriterA]);
 const row=(await as(id.writerA,'select author_layer,author_name,details from report.reports where id=$1',[id.rwriterA])).rows[0];assert.equal(row.author_layer,1);assert.equal(row.details._report_meta.author_name,row.author_name);
});
test('스데반 별도 분류와 수요예배 연결, 회의·공과는 출결 통계에 포함하지 않는다',async()=>{
 const internship=(await db.query("select id from report.groups where settings->>'report_category'='internship'")).rows;assert.equal(internship.length,1);
 assert.ok((await db.query("select 1 from report.group_service_types t join report.service_types s on s.id=t.service_type_id where t.group_id=$1 and s.name='수요예배'",[internship[0].id])).rows.length);
 const rid=(await as(id.writerA,"insert into report.reports(group_id,author_id,author_name,meeting_date,meeting_label,details) values($1,$2,'작성자',current_date,'팀 회의','{\"session_type\":\"meeting\"}') returning id",[id.a,id.writerA])).rows[0].id;
 await as(id.writerA,"select report.save_report($1,$2::jsonb,'submitted')",[rid,JSON.stringify({details:{session_type:'meeting',topic:'주제',content:'내용',members:[{name:'팀원',present:true,note:'상황',follow_up:'후속'}]},attendance:[{member_id:id.child,present:false}]})]);
 const saved=(await as(id.writerA,'select enrolled_snapshot,attend_snapshot,details from report.reports where id=$1',[rid])).rows[0];assert.equal(saved.enrolled_snapshot,null);assert.equal(saved.attend_snapshot,null);assert.equal(saved.details.members.length,1);
 assert.equal((await db.query('select * from report.attendance where report_id=$1',[rid])).rows.length,0);
 await deny(as(id.writerA,"select report.save_report($1,$2::jsonb,'draft')",[rid,JSON.stringify({details:{session_type:'standard'}})]));
});
test('리허설은 팀 담당자가 기록하며 미기록/불참/사유 있는 불참과 중복 입력을 구분한다',async()=>{
 const marks=[{member_id:id.staff1,status:'attended',note:''},{member_id:id.staff2,status:'absent',note:''}];
 const save=rows=>as(id.leadA,"select report.save_rehearsal($1,current_date,'리허설',$2::jsonb) rid",[id.sound,JSON.stringify(rows)]);
 const first=(await save(marks)).rows[0].rid;assert.equal((await save(marks)).rows[0].rid,first);
 assert.equal((await as(id.leadA,'select * from report.rehearsal_attendance')).rows.length,2);
 assert.equal((await as(id.leadB,'select * from report.rehearsals')).rows.length,0);
 await deny(as(id.writerA,"select report.save_rehearsal($1,current_date,'위조','[]')",[id.sound]));
 await deny(save([...marks,marks[0]]));
 await deny(as(id.leadA,"select report.save_rehearsal($1,current_date,'다른 팀',$2::jsonb)",[id.sound,JSON.stringify([{member_id:id.foreignStaff,status:'attended'}])]));
 assert.equal((await db.query("select * from report.rehearsals where title='다른 팀'")).rows.length,0);
 await deny(as(id.leadA,"select report.save_rehearsal($1,current_date+1,'미래','[]')",[id.sound]));
 const totals=rehearsalTotals([{id:id.staff1,name:'가'},{id:id.staff2,name:'나'},{id:'unrecorded',name:'다'}],marks,'absent');assert.equal(totals[0].id,id.staff2);assert.equal(totals.find(r=>r.id==='unrecorded').absent,0);
});
test('신청 알림 큐는 중복되지 않고 서비스 역할만 발송 작업을 확보한다',async()=>{
 await as(id.pending,'update report.profiles set requested_group_ids=array[$1::uuid] where id=$2',[id.a,id.pending]);
 await as(id.pending,'update report.profiles set requested_group_ids=array[$1::uuid] where id=$2',[id.b,id.pending]);
 assert.equal((await db.query('select * from report.registration_alerts')).rows.length,1);
 assert.equal((await as(id.pending,'select * from report.registration_alerts')).rows.length,0);
 await deny(as(id.pending,'select report.claim_registration_alert($1)',[id.pending]));
 await deny(as(null,'select report.claim_registration_alert($1)',[id.pending]));
 assert.equal((await as('service','select report.claim_registration_alert($1) claimed',[id.pending])).rows[0].claimed,true);
 assert.equal((await as('service','select report.claim_registration_alert($1) claimed',[id.pending])).rows[0].claimed,false);
 assert.equal((await db.query('select attempts from report.registration_alerts')).rows[0].attempts,1);
});
test('이슈는 자기 팀 하나로 작성하고 같은 예배는 팀과 작성자와 무관하게 한 묶음으로 모은다',async()=>{
 const create=(user,groups,title)=>as(user,"insert into report.worship_incidents(author_id,group_ids,occurred_on,service_name,title,circumstances,detailed) values($1,$2,current_date,'수요예배',$3,'경위',false) returning id,occurred_on::text as occurred_on,service_id,service_name",[user,groups,title]);
 const a=(await create(id.leadA,[id.sound],'음향')).rows[0],b=(await create(id.leadB,[id.video],'영상')).rows[0];
 await deny(create(id.leadA,[id.sound,id.video],'여러 팀'));await deny(create(id.leadA,[id.video],'다른 팀'));
 assert.equal((await as(id.leadA,'select id from report.worship_incidents where id=$1',[b.id])).rows.length,1);
 assert.equal(groupIncidentEvents([a,b]).length,1);assert.equal(groupIncidentEvents([a,b])[0].items.length,2);
 assert.equal(groupIncidentEvents([a,{...b,occurred_on:'2000-01-01'}]).length,2);
  assert.equal(groupIncidentEvents([{...a,service_id:'known-service'},{...b,service_name:'수요 예배'}]).length,1);
});
test('운영 12번의 JSON 작성자 기록을 13~15번으로 올려도 최초 이름·파트·원본 시각을 보존한다',async()=>{
 const upgrade=new PGlite();try{
  await upgrade.exec(SUPABASE_STUB);const dir=join(import.meta.dirname,'..','supabase');const files=readdirSync(join(dir,'migrations')).sort();
  for(const f of files.filter(f=>f<'20261027000000'))await upgrade.exec(readFileSync(join(dir,'migrations',f),'utf8'));
  await upgrade.exec(readFileSync(join(dir,'seed.sql'),'utf8'));
  const user=randomUUID();await upgrade.query('insert into auth.users(id,email) values($1,$2)',[user,'upgrade@example.com']);await upgrade.query("insert into report.profiles(id,real_name,status) values($1,'현재 프로필 이름','active')",[user]);
  const gid=(await upgrade.query("select id from report.groups where name='음향팀'")).rows[0].id;
  await upgrade.query("insert into report.memberships(user_id,group_id,role) values($1,$2,'writer')",[user,gid]);
  const rid=(await upgrade.query("insert into report.reports(group_id,author_id,meeting_date,meeting_label,details) values($1,$2,current_date,'예배',$3::jsonb) returning id",[gid,user,JSON.stringify({_report_meta:{author_name:'작성 당시 이름',duty_part:'방송 음향'},notes:'원본'})])).rows[0].id;
  const source=(await upgrade.query('select to_jsonb(r) body from report.reports r where id=$1',[rid])).rows[0].body;
  for(const f of files.filter(f=>f>='20261027000000'))await upgrade.exec(readFileSync(join(dir,'migrations',f),'utf8'));
  const after=(await upgrade.query('select to_jsonb(r) body from report.reports r where id=$1',[rid])).rows[0].body;
  assert.equal(after.author_name,'작성 당시 이름');assert.equal(after.duty_part,'방송 음향');
  for(const key of ['author_name','duty_part','last_edited_by','author_layer'])delete after[key];
  assert.deepEqual(after,source);
 }finally{await upgrade.close();}
});
