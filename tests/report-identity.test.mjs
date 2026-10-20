import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {SUPABASE_STUB} from './stub.mjs';
import {getReportIdentity,preserveReportIdentity} from '../src/lib/report-identity.ts';

test('작성자 이름은 저장 당시 이름으로 표시하고 현재 프로필 이름 변경과 분리한다',()=>{
  const stored={_report_meta:{author_name:'최초 작성자',duty_part:'방송 음향'}};
  assert.equal(getReportIdentity(stored,'바뀐 프로필 이름').author_name,'최초 작성자');
  assert.equal(getReportIdentity({},'기존 작성자').author_name,'기존 작성자');
  assert.equal(getReportIdentity({_report_meta:null},'이전 작성자').author_name,'이전 작성자');
  const next=preserveReportIdentity(stored,'다른 이름',{id:'reviewer-id',name:'검토 교역자'});
  assert.equal(next.author_name,'최초 작성자');assert.equal(next.duty_part,'방송 음향');
  assert.equal(next.last_editor_id,'reviewer-id');assert.equal(next.last_editor_name,'검토 교역자');
});
test('현행 12번 DB에서 같은 예배 세 보고와 작성자 기록을 스키마 변경 없이 저장·재저장한다',async()=>{
  const db=new PGlite();
  try {
    await db.exec(SUPABASE_STUB);
    const dir=join(import.meta.dirname,'..','supabase');
    for(const file of readdirSync(join(dir,'migrations')).sort())await db.exec(readFileSync(join(dir,'migrations',file),'utf8'));
    await db.exec(readFileSync(join(dir,'seed.sql'),'utf8'));
    const writer=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[writer,'writer@example.com']);
    await db.query("insert into report.profiles(id,real_name,status) values($1,'작성자','active')",[writer]);
    const group=(await db.query("select id from report.groups where name='음향팀'")).rows[0].id;
    await db.query("insert into report.memberships(user_id,group_id,role) values($1,$2,'writer')",[writer,group]);
    const asWriter=(sql,args)=>db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[writer]);return tx.query(sql,args)});
    const reports=[];
    for(const part of ['메인 음향','모니터 음향','방송 음향']){
      const metadata={author_name:`담당 ${part}`,duty_part:part};
      const r=await asWriter("insert into report.reports(group_id,author_id,meeting_date,meeting_label,details) values($1,$2,current_date,'동일 예배',$3::jsonb) returning id",[group,writer,JSON.stringify({_report_meta:metadata})]);
      reports.push(r.rows[0].id);
    }
    assert.equal((await asWriter("select id from report.reports where group_id=$1 and meeting_label='동일 예배'",[group])).rows.length,3);
    const stored=(await asWriter('select details from report.reports where id=$1',[reports[0]])).rows[0].details;
    const metadata=preserveReportIdentity(stored,'다른 이름',{id:writer,name:'현재 이름'});
    await asWriter("select report.save_report($1,$2::jsonb,'draft')",[reports[0],JSON.stringify({details:{notes:'예배 보고',_report_meta:metadata}})]);
    const saved=(await asWriter('select details from report.reports where id=$1',[reports[0]])).rows[0].details;
    assert.equal(getReportIdentity(saved).author_name,'담당 메인 음향');assert.equal(getReportIdentity(saved).duty_part,'메인 음향');
    assert.equal(saved.notes,'예배 보고');
    assert.equal((await db.query("select count(*)::int n from information_schema.columns where table_schema='report' and table_name='reports' and column_name='author_name'")).rows[0].n,0);
  } finally {await db.close();}
});
