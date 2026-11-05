import {test} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {SUPABASE_STUB} from './stub.mjs';
register('./tsx-loader.mjs',import.meta.url);
const {worshipPayload}=await import('../src/lib/report-forms.ts');

const base={details:{result:'normal',notes:'',sermon_passage:'',sermon_content:'',requests:[],mentions:[]},issues:[],messages:{pastor:'',pastor_wife:''}};

test('교역자·리더십 알림 선택값만 받는다',()=>{
 for(const notify of ['clergy','leadership',undefined])assert.ok(worshipPayload.safeParse({...base,details:{...base.details,notify}}).success);
 assert.ok(!worshipPayload.safeParse({...base,details:{...base.details,notify:'all'}}).success);
});

test('제출하면 교역자 전체 또는 리더십 전체(목사님·사모님·교역자)에게 한 번씩 알림이 간다',async()=>{const db=new PGlite();try{
 await db.exec(SUPABASE_STUB);for(const f of readdirSync('supabase/migrations').sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));await db.exec(readFileSync('supabase/seed.sql','utf8'));
 const ids={};
 for(const [n,minister,role,status] of [['writer',false,null,'active'],['minister',true,null,'active'],['minister2',true,null,'active'],['oldMinister',true,null,'disabled'],['pastor',false,'pastor','active'],['wife',false,'pastor_wife','active'],['member',false,null,'active']]){
  ids[n]=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[ids[n],n+'@example.com']);
  await db.query('insert into report.profiles(id,real_name,status,is_minister,recipient_role) values($1,$2,$3,$4,$5)',[ids[n],n,status,minister,role]);
 }
 const team=(await db.query("select id from report.groups where name='음향팀'")).rows[0].id;
 await db.query("insert into report.memberships(user_id,group_id,role,position) values($1,$2,'writer','오퍼레이터'),($3,$2,'writer','오퍼레이터')",[ids.writer,team,ids.member]);
 const as=(n,sql,args=[])=>db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[ids[n]]);return tx.query(sql,args);});
 const notified=async()=>{const r=await db.query("select user_id,title from report.inbox_notifications where report_event_key like '%:leaders:%'");const name=Object.fromEntries(Object.entries(ids).map(([k,v])=>[v,k]));return r.rows.map(x=>name[x.user_id]).sort();};
 const r=(await as('writer',"insert into report.reports(group_id,author_id,author_name,meeting_date,meeting_label) values($1,$2,'작성자',current_date,'수요예배') returning id,updated_at",[ team,ids.writer])).rows[0];
 const payload=worshipPayload.parse({...base,details:{...base.details,notify:'clergy'}});
 // 임시저장만으로는 알리지 않는다
 const version=(await as('writer','select report.autosave_report($1,$2,$3::jsonb) version',[r.id,r.updated_at,JSON.stringify(payload)])).rows[0].version;
 assert.deepEqual(await notified(),[]);
 await as('writer',"select report.save_report_from_draft($1,$2::jsonb,'submitted',$3)",[r.id,JSON.stringify(payload),version]);
 assert.deepEqual(await notified(),['minister','minister2']);
 // 알림 받은 교역자는 배정되지 않은 팀 보고도 읽는다(기존 권한)
 assert.equal((await as('minister','select id from report.reports where id=$1',[r.id])).rows.length,1);
 // 리더십 전체로 넓히면 목사님·사모님만 새로 받고, 교역자에게 다시 보내지 않는다
 await db.query("update report.reports set details=details||'{\"notify\":\"leadership\"}' where id=$1",[r.id]);
 assert.deepEqual(await notified(),['minister','minister2','pastor','wife']);
 await db.query("update report.reports set details=details||'{\"notes\":\"수정\"}' where id=$1",[r.id]);
 assert.equal((await notified()).length,4);
 // 일반 팀원, 비활성 교역자, 작성자 본인은 받지 않는다(위 목록에 없음). 알 수 없는 값은 무시한다
 const r2=(await db.query("insert into report.reports(group_id,author_id,author_name,meeting_date,meeting_label,status,details) values($1,$2,'교역자',current_date,'수요예배','submitted','{\"notify\":\"all\"}') returning id",[team,ids.minister])).rows[0];
 assert.equal((await db.query('select 1 from report.inbox_notifications where report_id=$1',[r2.id])).rows.length,0);
 // 교역자가 직접 쓴 보고면 본인은 빠진다
 await db.query("update report.reports set details='{\"notify\":\"clergy\"}' where id=$1",[r2.id]);
 assert.deepEqual((await db.query('select user_id from report.inbox_notifications where report_id=$1',[r2.id])).rows.map(x=>x.user_id),[ids.minister2]);
 // 교역자를 골라서 보내면 고른 교역자에게만 간다. 교역자가 아닌 계정·비활성 교역자·모르는 id·잘못된 값은 무시한다
 const r3=(await db.query("insert into report.reports(group_id,author_id,author_name,meeting_date,meeting_label,status,details) values($1,$2,'작성자',current_date,'수요예배','draft',$3::jsonb) returning id",[team,ids.writer,JSON.stringify({notify_ministers:[ids.minister2,ids.member,ids.oldMinister,ids.pastor,randomUUID(),'x']})])).rows[0];
 assert.equal((await db.query('select 1 from report.inbox_notifications where report_id=$1',[r3.id])).rows.length,0);
 await db.query("update report.reports set status='submitted' where id=$1",[r3.id]);
 assert.deepEqual((await db.query('select user_id from report.inbox_notifications where report_id=$1',[r3.id])).rows.map(x=>x.user_id),[ids.minister2]);
 // 나중에 한 명 더 고르면 그 사람만 새로 받는다
 await db.query("update report.reports set details=jsonb_set(details,'{notify_ministers}',$2::jsonb) where id=$1",[r3.id,JSON.stringify([ids.minister2,ids.minister])]);
 assert.deepEqual((await db.query('select user_id from report.inbox_notifications where report_id=$1 order by created_at,user_id',[r3.id])).rows.map(x=>x.user_id).sort(),[ids.minister,ids.minister2].sort());
}finally{await db.close();}});

test('교역자 개별 선택값 검증',()=>{
 assert.ok(worshipPayload.safeParse({...base,details:{...base.details,notify_ministers:[randomUUID()]}}).success);
 assert.ok(!worshipPayload.safeParse({...base,details:{...base.details,notify_ministers:['x']}}).success);
});
