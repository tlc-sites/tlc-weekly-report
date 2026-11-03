import {test} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
register('./tsx-loader.mjs',import.meta.url);
const {notificationCategory,NOTIFICATION_CATEGORIES}=await import('../src/lib/notification-category.ts');

// DB 트리거와 서버 코드가 실제로 만드는 알림 제목·주소
const cases=[
 ['새 보고서가 제출되었습니다','/reports/r1','report'],
 ['교역자가 보고서를 수정했습니다','/reports/r1','report'],
 ['새 피드백이 등록되었습니다','/reports/r1#comments','feedback'],
 ['피드백에 답글이 등록되었습니다','/incidents/i1#comments','feedback'],
 ['기도제목에 코멘트가 등록되었습니다','/prayer-meetings#prayer-1','feedback'],
 ['코멘트에 답글이 등록되었습니다','/prayer-meetings#prayer-1','feedback'],
 ['댓글에 답글이 등록되었습니다','/notices/n1#comments','feedback'],
 ['다른 부서에서 함께 봐 달라고 요청했습니다','/reports/r1','request'],
 ['새 비공개 메시지가 도착했습니다','/messages/t1','message'],
 ['성탄절 행사 안내','/notices/n1','notice'],
 ['이번 주 보고를 작성해 주세요','/write','reminder'],
 ['오늘 오후 5시에 보고를 전달해요','/','reminder'],
 ['미제출 3곳','/admin','reminder'],
 ['주일 2부 보고서 작성 부탁드립니다','/write','reminder'],
 ['이번 주 사역 보고가 준비됐어요','/meeting','reminder'],
 ['새 등록 신청이 도착했습니다','/admin/users','other'],
];
test('알림 제목·주소로 종류를 나눈다',()=>{
 for(const [title,url,want] of cases)assert.equal(notificationCategory({title,url}),want,title);
 // 모든 종류에 화면 이름이 있다
 assert.deepEqual(NOTIFICATION_CATEGORIES.map(([k])=>k),['report','feedback','request','message','notice','reminder','other']);
});
