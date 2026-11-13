import {test} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
register('./tsx-loader.mjs',import.meta.url);
const {partCardState}=await import('../src/lib/home-parts.ts');

test('홈 내 파트 카드: 이어 쓰기 · 보기 · 쓰기 · 미제출',()=>{
 const week='2026-11-08',me='u1';
 const g=(id,extra={})=>({id,name:id,type:'education',schedule:'weekly',...extra});
 const reports=[
  {id:'d1',group_id:'A',author_id:me,status:'draft'},
  {id:'s1',group_id:'A',author_id:'u2',status:'submitted'},
  {id:'s2',group_id:'B',author_id:'u2',status:'submitted'},{id:'r2',group_id:'B',author_id:'u3',status:'reviewed'},
  {id:'r3',group_id:'C',author_id:'u2',status:'reviewed'},
  {id:'d4',group_id:'D',author_id:'u2',status:'draft'},
 ];
 const before=new Date('2026-11-13T07:00:00Z'),after=new Date('2026-11-13T09:00:00Z');
 const s=(id,extra,now=before)=>partCardState(g(id,extra),reports,['N'],me,week,now);
 // 내 임시저장이 있으면 다른 사람 제출보다 먼저 '이어 쓰기'
 assert.deepEqual([s('A').label,s('A').action,s('A').href],['작성 중','이어 쓰기','/reports/d1']);
 assert.deepEqual([s('B').tone,s('B').label,s('B').action],['wait','확인 대기 2건','보기']);
 assert.deepEqual([s('C').tone,s('C').label],['done','확인 완료']);
 assert.deepEqual([s('D').label,s('D').action],['작성 중','보기']);
 assert.deepEqual([s('N').label,s('N').action],['모임 없음','보기']);
 assert.deepEqual([s('E').label,s('E').action,s('E').href],['작성 전','쓰기','/groups/E?week=2026-11-08#new-report']);
 // 마감(금 17시) 뒤: 매주 보고하는 파트만 미제출, 예배팀은 그대로 작성 전
 assert.equal(s('E',{},after).label,'미제출');
 assert.equal(s('W',{type:'worship'},after).label,'작성 전');
});
