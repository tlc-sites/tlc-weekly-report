import {test} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
register('./tsx-loader.mjs',import.meta.url);
const {reminderPick,meetingReminderUrl}=await import('../src/lib/reminder-link.ts');

test('모임 알림 링크: 예배·모임과 날짜를 골라 둔 작성 화면',()=>{
 const g='11111111-1111-1111-1111-111111111111',s='22222222-2222-2222-2222-222222222222',m='33333333-3333-3333-3333-333333333333';
 const schedules=[{group_id:g,label:'2부 예배',service_type_id:s},{group_id:g,label:'토요모임',service_type_id:null}];
 const meetings=[{id:m,group_id:g,name:'토요모임'}];
 assert.equal(reminderPick(g,'2부 예배',schedules,meetings),'service:'+s);
 assert.equal(reminderPick(g,'토요모임',schedules,meetings),'meeting:'+m);
 // 연결된 예배·모임을 못 찾으면 예전처럼 파트 화면만
 assert.equal(reminderPick(g,'수련회',schedules,meetings),null);
 assert.equal(reminderPick('other','2부 예배',schedules,meetings),null);
 assert.equal(meetingReminderUrl(g,'2026-11-15','service:'+s),`/groups/${g}?week=2026-11-15&pick=service%3A${s}&date=2026-11-15#new-report`);
 assert.equal(meetingReminderUrl(g,'2026-11-18',null),`/groups/${g}?week=2026-11-15#new-report`);
});
