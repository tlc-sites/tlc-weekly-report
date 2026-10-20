import {before,after,test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {join} from "node:path";
import {PGlite} from "@electric-sql/pglite";
import {SUPABASE_STUB} from "./stub.mjs";
const db=new PGlite();const id={};
async function as(user,sql,args=[]) {return db.transaction(async tx=>{await tx.exec(`set local role ${user?'authenticated':'anon'}`);if(user)await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);return tx.query(sql,args);});}
const deny=p=>assert.rejects(p,/permission|forbidden|row-level|original author|author name|not-null|check constraint/i);
before(async()=>{
  await db.exec(SUPABASE_STUB);
  const dir=join(import.meta.dirname,"..","supabase");
  const files=readdirSync(join(dir,"migrations")).sort();
  for(const f of files.filter(f=>f<'20261028000000'))await db.exec(readFileSync(join(dir,"migrations",f),'utf8'));
  await db.exec(readFileSync(join(dir,'seed.sql'),'utf8'));
  for(const name of ['senior','wife','ministerA','ministerB','dual','admin','lead','writer','peer','outsider','disabled']) {
    id[name]=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[id[name],name+'@example.com']);
    await db.query("insert into report.profiles(id,real_name,status,is_admin,is_minister,recipient_role) values($1,$2,$3,$4,$5,$6)",[id[name],name,name==='disabled'?'disabled':'active',['admin','dual'].includes(name),['ministerA','ministerB','dual'].includes(name),name==='senior'?'pastor':name==='wife'?'pastor_wife':null]);
  }
  id.sound=(await db.query("select id from report.groups where name='음향팀'")).rows[0].id;
  id.video=(await db.query("select id from report.groups where name='영상팀'")).rows[0].id;
  for(const name of ['ministerA','ministerB','dual','lead','writer','peer','outsider'])await db.query('insert into report.memberships(user_id,group_id,role) values($1,$2,$3)',[id[name],['ministerB','outsider'].includes(name)?id.video:id.sound,['ministerA','ministerB','lead'].includes(name)?'reviewer':'writer']);
  for(const [key,group,author]of [['rSound',id.sound,id.writer],['rVideo',id.video,id.outsider]]){id[key]=randomUUID();await db.query("insert into report.reports(id,group_id,author_id,meeting_date,meeting_label,details) values($1,$2,$3,current_date,'공통예배','{\"notes\":\"원본\"}')",[id[key],group,author]);}
  await db.query("insert into report.report_prayers(report_id,body) values($1,'기도제목')",[id.rSound]);
  await db.query("insert into report.report_messages(report_id,recipient,body) values($1,'pastor','비공개 글')",[id.rSound]);
  const source=(await db.query('select id,author_id,meeting_date,details from report.reports order by id')).rows;
  for(const f of files.filter(f=>f>='20261028000000'))await db.exec(readFileSync(join(dir,'migrations',f),'utf8'));
  assert.deepEqual((await db.query('select id,author_id,meeting_date,details from report.reports order by id')).rows,source);
  assert.equal((await db.query('select author_name from report.reports where id=$1',[id.rSound])).rows[0].author_name,'writer');
});
after(()=>db.close());
test('최종 계층: 교역자도 담당 파트만, 일반 팀원은 본인만, 최상단 전체, 관리자 단독 차단',async()=>{
  for(const [name,n]of [['senior',2],['wife',2],['ministerA',1],['ministerB',1],['dual',1],['lead',1],['writer',1],['peer',0],['admin',0],['disabled',0]])assert.equal((await as(id[name],'select id from report.reports')).rows.length,n,name);
  await deny(as(null,'select id from report.reports'));
  for(const name of ['ministerA','dual','senior','wife','writer'])assert.equal((await as(id[name],'select body from report.report_prayers')).rows.length,1,name);
  for(const name of ['ministerB','lead','peer','admin'])assert.equal((await as(id[name],'select body from report.report_prayers')).rows.length,0,name);
});
test('공개: 담당 교역자가 항목별 공개·취소, 열람 공개로 다른 비공개 내용이나 검토 권한은 얻지 못한다',async()=>{
  const grant=(user,kind)=>as(id[user],"insert into report.private_shares(report_id,content_kind,minister_id) values($1,$2,$3)",[id.rSound,kind,id.ministerB]);
  await deny(grant('lead','report'));await deny(grant('admin','report'));await deny(grant('ministerB','report'));
  await grant('ministerA','report');
  assert.equal((await as(id.ministerB,'select id from report.reports where id=$1',[id.rSound])).rows.length,1);
  assert.equal((await as(id.ministerB,'select body from report.report_prayers')).rows.length,0);
  assert.equal((await as(id.ministerB,'select body from report.report_messages')).rows.length,0);
  assert.equal((await as(id.ministerB,'select report.can_review_report($1) ok',[id.rSound])).rows[0].ok,false);
  assert.equal((await as(id.ministerB,"update report.reports set details='{}' where id=$1 returning id",[id.rSound])).rows.length,0);
  await as(id.ministerB,"insert into report.report_comments(report_id,author_id,body) values($1,$2,'공유받은 피드백')",[id.rSound,id.ministerB]);
  await grant('wife','prayer');assert.equal((await as(id.ministerB,'select body from report.report_prayers')).rows.length,1);
  await as(id.ministerA,'delete from report.private_shares where report_id=$1',[id.rSound]);
  assert.equal((await as(id.ministerB,'select id from report.reports where id=$1',[id.rSound])).rows.length,0);
});
test('작성은 모든 배정 직책: 한 예배에 세 담당자 보고, 작성자 이름 필수·최초 작성자와 수정 계정 보존',async()=>{
  for(const name of ['lead','writer','peer']) {
    const r=await as(id[name],"insert into report.reports(group_id,author_id,author_name,duty_part,meeting_date,meeting_label) values($1,$2,$3,$4,current_date,'동일 예배') returning id",[id.sound,id[name],name,`part ${name}`]);assert.equal(r.rows.length,1);
  }
  assert.equal((await as(id.ministerA,"select id from report.reports where meeting_label='동일 예배'")).rows.length,3);
  await deny(as(id.writer,"insert into report.reports(group_id,author_id,author_name,meeting_date,meeting_label) values($1,$2,'   ',current_date,'빈 이름')",[id.sound,id.writer]));
  await deny(as(id.writer,"insert into report.reports(group_id,author_id,meeting_date,meeting_label) values($1,$2,current_date,'이름 없음')",[id.sound,id.writer]));
  await as(id.ministerA,"update report.reports set details='{\"notes\":\"검토 수정\"}' where id=$1",[id.rSound]);
  const row=(await as(id.ministerA,'select author_name,author_id,last_edited_by from report.reports where id=$1',[id.rSound])).rows[0];
  assert.equal(row.author_name,'writer');assert.equal(row.author_id,id.writer);assert.equal(row.last_edited_by,id.ministerA);
  await deny(as(id.ministerA,"update report.reports set author_name='changed' where id=$1",[id.rSound]));
  assert.equal((await as(id.lead,"update report.reports set details='{}' where id=$1 returning id",[id.rSound])).rows.length,0);
  assert.equal((await as(id.lead,'select report.can_review_report($1) ok',[id.rSound])).rows[0].ok,false);
});
test('이슈 공개는 사건별: 한 건 공개가 같은 작성자·같은 팀의 다른 사건을 열지 않는다',async()=>{
  const items=[];for(const title of ['사고','경미한 이슈'])items.push((await as(id.writer,"insert into report.worship_incidents(author_id,group_ids,occurred_on,service_name,title,circumstances,detailed) values($1,array[$2::uuid],current_date,'예배',$3,'경위',false) returning id",[id.writer,id.sound,title])).rows[0].id);
  assert.equal((await as(id.ministerB,'select id from report.worship_incidents')).rows.length,0);
  await as(id.ministerA,'insert into report.incident_shares(incident_id,minister_id) values($1,$2)',[items[0],id.ministerB]);
  assert.deepEqual((await as(id.ministerB,'select id from report.worship_incidents')).rows.map(r=>r.id),[items[0]]);
  assert.equal((await as(id.ministerB,"update report.worship_incidents set circumstances='tamper' where id=$1 returning id",[items[0]])).rows.length,0);
  await as(id.ministerB,"insert into report.incident_comments(incident_id,author_id,body) values($1,$2,'공개 피드백')",[items[0],id.ministerB]);
  await deny(as(id.ministerB,"insert into report.incident_comments(incident_id,author_id,body) values($1,$2,'비공개 사건')",[items[1],id.ministerB]));
  await as(id.wife,'delete from report.incident_shares where incident_id=$1',[items[0]]);
  assert.equal((await as(id.ministerB,'select id from report.worship_incidents')).rows.length,0);
  await deny(as(id.admin,'truncate report.incident_shares'));
});
test('공지 레이어: 전체/두 분/담당 교역자/파트총괄/팀원, 다른 파트·기능 관리자에게 제목 푸시도 차단',async()=>{
  for(const [audience,expected]of [['all',['ministerA','dual','lead','writer','peer']],['senior',['senior','wife']],['minister',['ministerA','dual']],['lead',['lead']],['member',['writer','peer']]]) {
    const nid=(await as(id.senior,"insert into report.notices(author_id,target_group_id,audience,title,body) values($1,$2,$3,'소식','내용') returning id",[id.senior,id.sound,audience])).rows[0].id;
    const recipients=(await as(id.senior,'select user_id from report.notice_recipients($1)',[nid])).rows.map(r=>r.user_id);
    // 발신자인 담임목사님에게 중복 전송하지 않는다.
    assert.deepEqual(recipients.sort(),expected.filter(n=>n!=='senior').map(n=>id[n]).sort(),audience);
    for(const name of ['ministerB','admin','outsider'])assert.equal((await as(id[name],'select id from report.notices where id=$1',[nid])).rows.length,0,name+audience);
  }
});
