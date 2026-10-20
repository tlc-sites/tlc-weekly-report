// 최신 전체 마이그레이션을 적용한 DB에서 역할 조합과 비공개 공개 범위를 검증한다.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { SUPABASE_STUB } from "./stub.mjs";

const dir=join(import.meta.dirname,"..","supabase");
const db=new PGlite();
const ids={};
async function as(user,sql,params=[]) {
  return db.transaction(async tx=>{
    await tx.exec(`set local role ${user ? "authenticated" : "anon"}`);
    if(user) await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
    return tx.query(sql,params);
  });
}
const rows=async(user,table)=> (await as(user,`select * from report.${table}`)).rows;
const forbidden=promise=>assert.rejects(promise,/permission|forbidden|row-level|own content|senior/i);
before(async()=>{
  await db.exec(SUPABASE_STUB);
  const files=readdirSync(join(dir,"migrations")).sort().filter(f=>f<"20261028000000");
  for(const file of files.filter(f=>f<"20261027000000")) await db.exec(readFileSync(join(dir,"migrations",file),"utf8"));
  await db.exec(readFileSync(join(dir,"seed.sql"),"utf8"));
  for(const name of ["senior","wife","minister","otherMinister","admin","dual","lead","writer","peer","outsider","pending","disabled"]) {
    ids[name]=randomUUID();
    await db.query("insert into auth.users(id,email) values($1,$2)",[ids[name],`${name}@example.com`]);
    await db.query("insert into report.profiles(id,real_name,status,is_admin) values($1,$2,'active',$3)",[ids[name],name,["admin","dual"].includes(name)]);
  }
  await db.exec("update report.profiles set recipient_role='pastor' where real_name='senior'; update report.profiles set recipient_role='pastor_wife' where real_name='wife'");
  ids.group=(await db.query("select id from report.groups where name='중등부'")).rows[0].id;
  ids.sound=(await db.query("select id from report.groups where name='음향팀'")).rows[0].id;
  ids.parent=(await db.query("select id from report.groups where name='교육부'")).rows[0].id;
  for(const name of ["writer","peer","lead","minister"]) await db.query("insert into report.memberships(user_id,group_id,role) values($1,$2,$3)",[ids[name],name==="minister"?ids.parent:ids.group,["writer","peer"].includes(name)?"writer":"reviewer"]);
  for(const name of ["writer","peer"]) {
    ids[`${name}Report`]=randomUUID();
    await db.query("insert into report.reports(id,group_id,author_id,meeting_date,meeting_label) values($1,$2,$3,current_date,'예배')",[ids[`${name}Report`],ids.group,ids[name]]);
  }
  await db.query("insert into report.report_prayers(report_id,body) values($1,'private prayer')",[ids.writerReport]);
  for(const kind of ["pastor","pastor_wife"]) await db.query("insert into report.report_messages(report_id,recipient,body) values($1,$2,$3)",[ids.writerReport,kind,`private ${kind}`]);
  const before=(await db.query("select id,details,author_id,meeting_date from report.reports order by id")).rows;
  for(const file of files.filter(f=>f>="20261027000000")) await db.exec(readFileSync(join(dir,"migrations",file),"utf8"));
  assert.deepEqual((await db.query("select id,details,author_id,meeting_date from report.reports order by id")).rows,before);
  assert.equal((await db.query("select count(*)::int n from report.profiles where is_minister")).rows[0].n,0);
  for(const name of ["minister","otherMinister","dual","pending","disabled"]) await as(ids.senior,"select report.set_minister($1,true)",[ids[name]]);
  await db.exec("update report.profiles set status='pending' where real_name='pending'; update report.profiles set status='disabled' where real_name='disabled'");
});
after(()=>db.close());

test("계층: 최상단·교역자는 전체 일반 보고, 중단은 파트 열람, 팀원은 본인 보고만",async()=>{
  for(const name of ["senior","wife","minister","otherMinister","dual","lead"]) assert.equal((await rows(ids[name],"reports")).length,2,name);
  for(const name of ["writer","peer"]) assert.deepEqual((await rows(ids[name],"reports")).map(r=>r.author_id),[ids[name]],name);
  for(const name of ["admin","outsider","pending","disabled"]) assert.equal((await rows(ids[name],"reports")).length,0,name);
  await forbidden(rows(null,"reports"));
  assert.equal((await as(ids.admin,"select report.is_admin() ok")).rows[0].ok,true);
  assert.equal((await as(ids.senior,"select report.is_admin() ok")).rows[0].ok,true);
});
test("비공개: 두 분과 담당 교역자·작성자만 기본 열람, 무관 교역자·중단·관리자는 차단",async()=>{
  for(const name of ["senior","wife","minister","writer"]) {
    assert.equal((await rows(ids[name],"report_prayers")).length,1,name);
    assert.equal((await rows(ids[name],"report_messages")).length,2,name);
  }
  for(const name of ["otherMinister","dual","lead","peer","admin","pending","disabled"]) {
    assert.equal((await rows(ids[name],"report_prayers")).length,0,name);
    assert.equal((await rows(ids[name],"report_messages")).length,0,name);
  }
});
test("개별 공개·취소는 최상단만, 기도와 두 수신인 글은 각각 독립",async()=>{
  const grant=(user,kind)=>as(user,"insert into report.private_shares(report_id,content_kind,minister_id) values($1,$2,$3)",[ids.writerReport,kind,ids.otherMinister]);
  await forbidden(grant(ids.minister,"prayer"));
  await forbidden(grant(ids.admin,"prayer"));
  await grant(ids.wife,"pastor");
  assert.deepEqual((await rows(ids.otherMinister,"report_messages")).map(m=>m.recipient),["pastor"]);
  assert.equal((await rows(ids.otherMinister,"report_prayers")).length,0);
  await grant(ids.senior,"prayer");
  assert.equal((await rows(ids.otherMinister,"report_prayers")).length,1);
  await as(ids.wife,"delete from report.private_shares where report_id=$1",[ids.writerReport]);
  assert.equal((await rows(ids.otherMinister,"report_messages")).length,0);
  assert.equal((await rows(ids.otherMinister,"report_prayers")).length,0);
  await forbidden(as(ids.admin,"truncate report.private_shares"));
});
test("중단은 수정·확인·작성 불가, 팀원·관리자는 목회 피드백 작성 불가",async()=>{
  for(const name of ["lead","admin","outsider"]) {
    assert.equal((await as(ids[name],"update report.reports set details='{\"notes\":\"tamper\"}' where id=$1 returning id",[ids.writerReport])).rows.length,0,name);
    await forbidden(as(ids[name],"insert into report.reports(group_id,author_id,meeting_date,meeting_label) values($1,$2,current_date,'새 모임')",[ids.group,ids[name]]));
  }
  for(const name of ["lead","writer","peer","admin","pending","disabled"]) await forbidden(as(ids[name],"insert into report.report_comments(report_id,author_id,body) values($1,$2,'feedback')",[ids.writerReport,ids[name]]));
  for(const name of ["senior","wife","minister","otherMinister","dual"]) await as(ids[name],"insert into report.report_comments(report_id,author_id,body) values($1,$2,'feedback')",[ids.writerReport,ids[name]]);
  assert.equal((await rows(ids.writer,"report_comments")).length,5);
  assert.equal((await rows(ids.peer,"report_comments")).length,0);
  assert.equal((await as(ids.minister,"update report.reports set details='{\"notes\":\"pastoral edit\"}' where id=$1 returning id",[ids.writerReport])).rows.length,1);
});
test("관리자 자가 승격 차단, 교역자+관리자 조합은 독립, 숨긴 기도제목은 일반 수정 시 보존",async()=>{
  await forbidden(as(ids.admin,"select report.set_minister($1,true)",[ids.admin]));
  await forbidden(as(ids.admin,"select report.set_recipient_role($1,'pastor')",[ids.admin]));
  await forbidden(as(ids.admin,"select report.set_memberships($1,$2::jsonb)",[ids.admin,JSON.stringify([{group_id:ids.group,role:"reviewer"}])]));
  await as(ids.otherMinister,"select report.save_report($1,$2::jsonb,'draft')",[ids.writerReport,JSON.stringify({details:{notes:"ordinary"},prayer:"must not overwrite"})]);
  assert.equal((await rows(ids.senior,"report_prayers"))[0].body,"private prayer");
  assert.equal((await as(ids.dual,"select report.is_admin() admin,report.is_clergy() clergy")).rows[0].admin,true);
  await forbidden(as(ids.writer,"update report.profiles set is_minister=true where id=$1",[ids.writer]));
});
test("팀 이슈는 동일 ID의 피드백을 공유하며 중단 열람만·작성자 본인 수정·교역자 작성",async()=>{
  await db.query("insert into report.memberships(user_id,group_id,role) values($1,$3,'writer'),($2,$3,'reviewer')",[ids.writer,ids.lead,ids.sound]);
  const incident=(await as(ids.writer,"insert into report.worship_incidents(author_id,group_ids,occurred_on,service_name,title,circumstances,detailed) values($1,array[$2::uuid],current_date,'예배','issue','details',false) returning id",[ids.writer,ids.sound])).rows[0].id;
  assert.equal((await rows(ids.lead,"worship_incidents")).length,1);
  assert.equal((await as(ids.lead,"update report.worship_incidents set circumstances='tamper' where id=$1 returning id",[incident])).rows.length,0);
  assert.equal((await rows(ids.admin,"worship_incidents")).length,0);
  for(const name of ["lead","writer","admin"]) await forbidden(as(ids[name],"insert into report.incident_comments(incident_id,author_id,body) values($1,$2,'feedback')",[incident,ids[name]]));
  await as(ids.minister,"insert into report.incident_comments(incident_id,author_id,body) values($1,$2,'pastoral feedback')",[incident,ids.minister]);
  assert.equal((await rows(ids.writer,"incident_comments")).length,1);
  assert.equal((await rows(ids.lead,"incident_comments")).length,1);
  assert.equal((await rows(ids.peer,"incident_comments")).length,0);
  await forbidden(as(ids.admin,"truncate report.incident_comments"));
});
test("최신 권한에서도 본인 보고 생성·RETURNING과 기능 관리는 가능, 내용 TRUNCATE는 차단",async()=>{
  const result=await as(ids.writer,"insert into report.reports(group_id,author_id,meeting_date,meeting_label) values($1,$2,current_date,'추가 모임') returning id",[ids.group,ids.writer]);
  assert.equal(result.rows.length,1);
  await forbidden(as(ids.writer,"insert into report.reports(group_id,author_id,meeting_date,meeting_label) values($1,$2,current_date,'위조') returning id",[ids.group,ids.peer]));
  assert.equal((await as(ids.admin,"update report.groups set sort_order=sort_order where id=$1 returning id",[ids.group])).rows.length,1);
  for(const name of ["admin","writer","lead"]) await forbidden(as(ids[name],"truncate report.report_comments"));
  assert.equal((await as(ids.lead,"select report.can_review_report($1) ok",[ids.writerReport])).rows[0].ok,false);
  assert.equal((await as(ids.minister,"select report.can_review_report($1) ok",[ids.writerReport])).rows[0].ok,true);
});
test("공지 작성은 교역자·기능 관리자, 다른 공지의 내용·제목 푸시는 관리자 역할로 우회하지 않는다",async()=>{
  const notice=(await as(ids.minister,"insert into report.notices(author_id,target_type,title,body) values($1,'education','notice','body') returning id",[ids.minister])).rows[0].id;
  assert.equal((await as(ids.admin,"select id from report.notices where id=$1",[notice])).rows.length,0);
  const recipients=(await as(ids.minister,"select * from report.notice_recipients($1)",[notice])).rows.map(r=>r.user_id);
  assert.ok(!recipients.includes(ids.admin));
  assert.ok(recipients.includes(ids.senior));
  assert.ok(recipients.includes(ids.dual));
  await forbidden(as(ids.lead,"insert into report.notices(author_id,target_group_id,title,body) values($1,$2,'notice','body')",[ids.lead,ids.group]));
});
