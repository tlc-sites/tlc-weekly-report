import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lf,formFields} from '../src/lib/form-text.ts';
test('폼 글자 값의 줄바꿈을 한 글자(\\n)로 맞춘다',()=>{
 // 모임 없음 사유 이슈: 화면 97자, 브라우저 전송 102자
 const typed='팀원 개인 일정들 겹침\n- 김기윤 셀\n- 이지윤 어머지 생신\n- 김도현 업무\n화요일 예배팀 연습 모임이 길어짐에 따라,\n모임 요일을 화요일에서 수요일로 옮기는 중에 있습니다.';
 const sent=typed.replace(/\n/g,'\r\n');
 assert.equal(typed.length,97);assert.equal(sent.length,102);
 assert.equal(lf(sent),typed);assert.equal(lf('a\rb'),'a\nb');assert.equal(lf(null),null);
 const form=new FormData();form.append('body',sent);form.append('id','x');const file=new Blob(['x']);form.append('photo',file);
 const fields=formFields(form);
 assert.equal(fields.body,typed);assert.equal(fields.id,'x');assert.ok(fields.photo instanceof Blob);
});
