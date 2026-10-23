import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';

test('제출 푸시는 DB 수신자만 사용하고 알림함 중복·중복 발송·비활성 수신을 막는다',async()=>{
 let enabled=true, claimed=true, lookupError=false; const sent=[], claims=[], filters=[];
 const admin={from(table){const q={
  select(){return q;},eq(k,v){filters.push([table,k,v]);return q;},not(){return q;},gte(k,v){filters.push([table,k,v]);return q;},
  upsert(value){claims.push(value);return q;},maybeSingle(){return Promise.resolve({data:{status:'active',notify_enabled:enabled},error:null});},
  then(resolve){return Promise.resolve({data:table==='inbox_notifications'?[{id:'notice',user_id:'recipient',title:'제출',body:'안내',url:'/reports/report',created_at:'2026-10-23T00:00:00Z'}]:table==='push_subscriptions'?[{id:'device'}]:claimed?[{user_id:'recipient'}]:[],error:lookupError&&table==='inbox_notifications'?{}:null}).then(resolve);}
 };return q;}};
 globalThis.__reportPushTest={admin,send:async(...args)=>{sent.push(args);return {sent:1,failed:0,removed:0};}};
 let source=readFileSync('src/lib/report-submission-push.ts','utf8').replace('import "server-only";','').replace('import { createAdminClient } from "./supabase/admin";','const createAdminClient=()=>globalThis.__reportPushTest.admin;').replace('import { sendToSubscriptions } from "./push";','const sendToSubscriptions=(...args)=>globalThis.__reportPushTest.send(...args);').replace('import { weekOf } from "./week";', 'const weekOf=()=>"2026-10-18";');
 const {notifyReportSubmission}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
 try{
  await notifyReportSubmission('report','2026-10-23T00:00:00Z');
  assert.equal(sent.length,1);assert.deepEqual(sent[0][3],[],'기존 종 알림 중복 생성 금지');
  assert.equal(sent[0][2].url,'/reports/report');assert.equal(claims[0].slot,'report-push:notice');
  assert.ok(filters.some(x=>x[0]==='inbox_notifications'&&x[1]==='report_id'&&x[2]==='report'));
  enabled=false;await notifyReportSubmission('report','2026-10-23T00:00:00Z');assert.equal(sent.length,1,'알림 비활성은 푸시 제외');
  enabled=true;claimed=false;await notifyReportSubmission('report','2026-10-23T00:00:00Z');assert.equal(sent.length,1,'중복 claim은 발송 제외');
  lookupError=true;await assert.rejects(notifyReportSubmission('report','2026-10-23T00:00:00Z'),/lookup failed/);
 }finally{delete globalThis.__reportPushTest;}
});
