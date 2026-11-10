import {test} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
register('./tsx-loader.mjs',import.meta.url);
const {closedWeeks,reviewScope,summarizeMissing}=await import('../src/lib/missing-reports.ts');

test('마감(금 17시 KST)이 지난 주만 센다',()=>{
 // 2026-11-08(일) 주의 마감은 11-13(금) 16:59:59 KST
 assert.deepEqual(closedWeeks(2,new Date('2026-11-13T07:59:00Z'),'2026-11-13'),['2026-11-01','2026-10-25']);
 assert.deepEqual(closedWeeks(2,new Date('2026-11-13T08:00:00Z'),'2026-11-13'),['2026-11-08','2026-11-01']);
});

test('담당 교역자 범위: 맡은 상위 그룹의 하위까지, 작성자 소속은 제외',()=>{
 const groups=[{id:'edu',parent_id:null},{id:'kid',parent_id:'edu'},{id:'kid1',parent_id:'kid'},{id:'school',parent_id:null}];
 const s=reviewScope(groups,[{group_id:'edu',role:'reviewer',position:'담당교역자'},{group_id:'school',role:'writer',position:'리더'}]);
 assert.deepEqual([...s].sort(),['edu','kid','kid1']);
 assert.deepEqual([...reviewScope(groups,[{group_id:'school',role:'reviewer',position:null}])],['school']);
});

test('부서별·사람별 미제출: 제출·모임 없음·예배팀·하위 있는 그룹·생긴 뒤만',()=>{
 const g=(id,extra={})=>({id,type:'education',label:id,parent_id:null,schedule:'weekly',is_active:true,created_at:'2026-01-01T00:00:00Z',...extra});
 const groups=[g('A'),g('B'),g('P'),g('C',{parent_id:'P'}),g('W',{type:'worship'}),g('I',{schedule:'irregular'}),g('N',{created_at:'2026-11-07T00:00:00Z'})];
 const weeks=['2026-11-08','2026-11-01'];
 const reports=[{group_id:'A',week:'2026-11-08',status:'submitted'},{group_id:'A',week:'2026-11-01',status:'draft'}];
 const noMeeting=[{group_id:'B',week:'2026-11-01'}];
 const m=(user_id,group_id,created_at='2026-01-01T00:00:00Z')=>({user_id,group_id,role:'writer',position:null,created_at});
 const memberships=[m('u1','A'),m('u2','B',"2026-11-05T00:00:00Z"),m('u3','P')];
 const names=new Map([['u1','김하나'],['u2','이둘'],['u3','박셋']]);
 const r=summarizeMissing(groups,reports,noMeeting,memberships,names,weeks);
 const byG=Object.fromEntries(r.byGroup.map(x=>[x.group.id,x]));
 assert.deepEqual(Object.keys(byG).sort(),['A','B','C','N']);
 assert.deepEqual(byG.A.weeks,['2026-11-01']);assert.deepEqual(byG.A.drafts,['2026-11-01']);
 assert.deepEqual(byG.B.weeks,['2026-11-08']);
 assert.deepEqual(byG.N.weeks,['2026-11-08']); // 11-01 주 마감(11-06) 뒤에 생긴 부서는 그 주를 세지 않음
 assert.deepEqual(byG.C.writers.map(w=>w.name),['박셋']); // 직접 작성자가 없으면 상위 그룹 작성자
 const byP=Object.fromEntries(r.byPerson.map(p=>[p.name,p.items.map(i=>i.group.id+'|'+i.week)]));
 assert.deepEqual(byP['김하나'],['A|2026-11-01']);
 assert.deepEqual(byP['이둘'],['B|2026-11-08']);
 assert.deepEqual(byP['박셋'],['C|2026-11-08','C|2026-11-01']);
 assert.deepEqual(byP['작성자 미지정'],['N|2026-11-08']);
 assert.equal(r.byPerson.at(-1).name,'작성자 미지정');
 assert.equal(r.countedGroups,4); // A·B·C·N (P는 하위 있음, W 예배팀, I 비정기)
});
