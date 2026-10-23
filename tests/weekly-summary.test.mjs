import {test} from 'node:test';
import assert from 'node:assert/strict';
import {weeklyBlocks,weeklyEmailHtml} from './weekly-summary-module.mjs';
test('같은 예배 아래 모든 기술팀·복수 작성자, 교육부서별·그 외 분리, 메일 이스케이프',()=>{
 const groups=[{id:'sound',name:'음향팀',type:'worship',sort_order:1},{id:'video',name:'영상팀',type:'worship',sort_order:2},{id:'school',name:'초등부',type:'education'},{id:'campus',name:'부산',type:'campus'}];
 const base={meeting_date:'2026-10-18',meeting_label:null,status:'submitted',details:{notes:'<script>위험</script>'},service:{name:'1부 예배',sort_order:1},service_type_id:'service1'};
 const reports=[{...base,id:'a',group_id:'sound',author_name:'가'},{...base,id:'b',group_id:'video',author_name:'나'},{...base,id:'c',group_id:'sound',author_name:'다'},{...base,id:'d',group_id:'school'},{...base,id:'e',group_id:'campus'},{...base,id:'f',group_id:'sound',status:'draft'}];
 const blocks=weeklyBlocks(reports,groups);assert.equal(blocks.length,3);assert.equal(blocks[0].reports.length,3);assert.equal(blocks[0].title,'주일 1부 · 2026-10-18');assert.equal(blocks[1].kind,'education');assert.equal(blocks[2].kind,'other');
 const html=weeklyEmailHtml('2026-10-18',reports,groups);assert.ok(html.includes('음향팀'));assert.ok(html.includes('영상팀'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('/reports/f"'));
});
