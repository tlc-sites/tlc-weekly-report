import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
test('푸시 클릭은 이동 완료 후 포커스하고 닫힌 창은 새 창으로 연다',async()=>{
 for(const mode of ['existing','closed','external']){
  const handlers={},calls=[];let pending;
  const self={location:{origin:'https://report.example'},addEventListener:(n,f)=>handlers[n]=f,clients:{matchAll:async()=>[{url:'https://report.example/',navigate:async url=>{calls.push(url);if(mode==='closed')throw Error('closed');return {focus:async()=>calls.push('focus')};},focus:()=>{throw Error('stale focus');}}],openWindow:async url=>calls.push('open:'+url)}};
  runInNewContext(readFileSync('public/sw.js','utf8'),{self,URL});
  handlers.notificationclick({notification:{close(){},data:{url:mode==='external'?'https://other.example':'/reports/123#comments'}},waitUntil:p=>pending=p});
  await pending;
  if(mode==='external')assert.deepEqual(calls,[]);
  else assert.deepEqual(calls,['https://report.example/reports/123#comments',mode==='existing'?'focus':'open:https://report.example/reports/123#comments']);
 }
});
