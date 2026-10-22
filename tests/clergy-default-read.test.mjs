import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {SUPABASE_STUB} from './stub.mjs';
import {stripTypeScriptTypes} from 'node:module';
const formSource=stripTypeScriptTypes(readFileSync('src/lib/report-forms.ts','utf8').replace('"zod"',JSON.stringify(import.meta.resolve('zod'))).replace('"./members"',JSON.stringify(new URL('../src/lib/members.ts',import.meta.url).href)));
const {campusSectionRows,CAMPUS_TEXTS,missingOnSubmit}=await import('data:text/javascript;base64,'+Buffer.from(formSource).toString('base64'));
test('부산 사역 소식을 부서별로 배치하고 기존 원문을 중복·누락 없이 보존한다',()=>{
 const details={report_mode:'sections',sections:{adults:'새 장년부 보고'},texts:Object.fromEntries(CAMPUS_TEXTS.map(([k])=>[k,'원문 '+k]))};
 const before=JSON.stringify(details),rows=campusSectionRows(details);
 assert.equal(rows.length,12);assert.equal(rows[0][0],"교회 전체적인 사역 중점 사항 및 방향");assert.deepEqual(rows.slice(-3).map(([label])=>label),["시설 관련 사항","성도님들의 섬김 받은 사항","그 외 특기 사항"]);assert.equal(JSON.stringify(details),before);
 for(const [key] of CAMPUS_TEXTS)assert.equal(rows.filter(([,body])=>body.includes('원문 '+key)).length,1,key);
 assert.match(rows.find(([label])=>label==='교회학교')[1],/원문 youth/);
 assert.match(rows.find(([label])=>label==='새가족 현황')[1],/원문 visitors/);
 assert.match(rows.find(([label])=>label==='장년부')[1],/새 장년부 보고/);
 assert.ok(!missingOnSubmit('campus',{details:{report_mode:'sections',texts:{visitors:'새가족 소식'}}}).includes('새가족 관련 보고'));
 assert.ok(missingOnSubmit('campus',{details:{report_mode:'sections',texts:{visitors:'새가족 소식'}}}).includes('헌금 챙김'));
});
test('다른 파트의 제출된 일반 보고는 모든 교역자에게 공개하되 비공개·명단·수정 권한은 유지한다',async()=>{
 const db=new PGlite();try{
 await db.exec(SUPABASE_STUB);for(const f of readdirSync('supabase/migrations').sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));await db.exec(readFileSync('supabase/seed.sql','utf8'));
 const ids={};for(const name of ['writer','clergy','admin','disabled']){ids[name]=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[ids[name],name+'@example.com']);await db.query('insert into report.profiles(id,real_name,status,is_minister,is_admin) values($1,$2,$3,$4,$5)',[ids[name],name,name==='disabled'?'disabled':'active',['clergy','disabled'].includes(name),name==='admin']);}
 const gid=(await db.query("select id from report.groups where name='음향팀'")).rows[0].id;
 await db.query("insert into report.memberships(user_id,group_id,role) values($1,$2,'writer')",[ids.writer,gid]);
 const reports=[];for(const status of ['submitted','draft']){reports.push((await db.query("insert into report.reports(group_id,author_id,author_name,meeting_date,meeting_label,status,details) values($1,$2,'작성자',current_date,'예배',$3,'{\"result\":\"normal\"}') returning id",[gid,ids.writer,status])).rows[0].id);}
 await db.query("insert into report.report_prayers(report_id,body) values($1,'비공개 기도')",[reports[0]]);
 await db.query("insert into report.report_messages(report_id,recipient,body) values($1,'pastor','비공개 메시지')",[reports[0]]);
 async function as(name,sql,args=[]){return db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[ids[name]]);return tx.query(sql,args);});}
 assert.deepEqual((await as('clergy','select id from report.reports')).rows.map(r=>r.id),[reports[0]]);
 assert.equal((await as('clergy','select report.can_view_report($1) ok',[reports[0]])).rows[0].ok,true);
 assert.equal((await as('clergy','select report.can_view_group($1) ok',[gid])).rows[0].ok,true);
 for(const table of ['report_prayers','report_messages'])assert.equal((await as('clergy','select * from report.'+table)).rows.length,0);
 assert.equal((await as('clergy','select report.can_view_roster($1) ok',[gid])).rows[0].ok,false);
 assert.equal((await as('clergy','select report.can_edit_report($1) ok',[reports[0]])).rows[0].ok,false);
 assert.equal((await as('clergy',"update report.reports set details='{}' where id=$1 returning id",[reports[0]])).rows.length,0);
 for(const name of ['admin','disabled'])assert.equal((await as(name,'select id from report.reports')).rows.length,0);
 }finally{await db.close();}
});
