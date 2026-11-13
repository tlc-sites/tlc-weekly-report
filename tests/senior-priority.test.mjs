import {test} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
register('./tsx-loader.mjs',import.meta.url);
const {priorityTiers,reportTier,isUnread}=await import('../src/lib/senior-priority.ts');

const r=(id,details={},extra={})=>({id,group_id:'g',meeting_date:'2026-11-08',meeting_label:null,status:'submitted',service:null,updated_at:'v1',details,...extra});
test('주간 요약 중요한 것부터: 사고·확인 필요 → 드리는 글 → 살펴볼 것 → 이상 없음',()=>{
 assert.equal(reportTier(r('a',{result:'incident'}),false),'urgent');
 assert.equal(reportTier(r('a',{needs_attention:true,attention_status:'temporary'}),true),'urgent');
 assert.equal(reportTier(r('a',{result:'normal'}),true),'message');
 assert.equal(reportTier(r('a',{result:'minor'}),false),'review');
 assert.equal(reportTier(r('a',{requests:[{category:'시설',content:'마이크 교체'}]}),false),'review');
 assert.equal(reportTier(r('a',{requests:[{category:'시설',content:'  '}]}),false),'clear');
 assert.equal(reportTier(r('a',{issue_summary:'음향 · 하울링'}),false),'review');
 assert.equal(reportTier(r('a',{needs_attention:true,attention_status:'resolved'}),false),'review');
 assert.equal(reportTier(r('a',{result:'normal',notes:'잘 마쳤습니다'}),false),'clear');
 const inc=(id,status)=>({id,status,group_ids:[],title:'',occurred_on:'2026-11-08',service_id:null,service_name:'',circumstances:'',response:''});
 const tiers=priorityTiers([r('x',{}),r('y',{result:'incident'}),r('d',{},{status:'draft'}),r('m',{})],[inc('i1','open'),inc('i2','resolved')],new Set(['m']));
 assert.deepEqual(tiers.map(t=>[t.tier,t.items.map(i=>i.kind==='report'?i.report.id:i.incident.id)]),[['urgent',['i1','y']],['message',['m']],['review',['i2']],['clear',['x']]]);
});
test('안 읽은 보고: 열람 기록이 없거나 수정 뒤 다시 열지 않음',()=>{
 const reads=new Map([['a','v1'],['b','v0']]);
 assert.equal(isUnread(r('a'),reads),false);
 assert.equal(isUnread(r('b'),reads),true);
 assert.equal(isUnread(r('c'),reads),true);
});
