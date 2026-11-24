import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templateSchedule, nextServiceDate, occursOn, cueLabelFor, scheduleLabel, upcomingLabel, cueDayName } from '../src/lib/pd-schedule.ts';
import { serviceOccursOn } from '../src/lib/service-schedule.ts';

// 운영 예배 목록(2026-11-24 확인)과 같은 값
const types = [
  { name: '1부 예배', weekday: 0, month_week: null },
  { name: '라이프라인', weekday: 0, month_week: null },
  { name: '수요예배', weekday: 3, month_week: null },
  { name: '테스트예배', weekday: 6, month_week: null },
  { name: '라이프라인 금요예배', weekday: 5, month_week: null },
  { name: '어웨이크 AWAKE', weekday: 5, month_week: 1 },
  { name: '리바이브드 REVIVED', weekday: 5, month_week: 2 },
  { name: '인카운터 ENCOUNTER', weekday: 5, month_week: 3 },
  { name: '워십나잇 WORSHIP NIGHT', weekday: 5, month_week: -1 },
];

test('양식 이름으로 예배 목록의 요일·주차를 찾는다', () => {
  assert.deepEqual(templateSchedule('sun1', '주일 1부', types), { weekday: 0, month_week: null });
  assert.deepEqual(templateSchedule('life', '라이프라인', types), { weekday: 0, month_week: null });
  assert.deepEqual(templateSchedule('sd8184d3ed2', '수요예배', types), { weekday: 3, month_week: null });
  assert.deepEqual(templateSchedule('sx', 'AWAKE', types), { weekday: 5, month_week: 1 });
  assert.deepEqual(templateSchedule('sx', 'REVIVED', types), { weekday: 5, month_week: 2 });
  assert.deepEqual(templateSchedule('sx', 'ENCOUNTER', types), { weekday: 5, month_week: 3 });
  assert.deepEqual(templateSchedule('sx', 'WORSHIP NIGHT', types), { weekday: 5, month_week: -1 });
  assert.deepEqual(templateSchedule('sx', '금요예배', types), { weekday: 5, month_week: null });
  // 못 찾으면 예전처럼 주일
  assert.deepEqual(templateSchedule('sx', '특별예배', types), { weekday: 0, month_week: null });
  // 예배 목록을 못 읽어도 주일
  assert.deepEqual(templateSchedule('sx', '수요예배', []), { weekday: 0, month_week: null });
});

test('다가오는 예배 날', () => {
  const wed = { weekday: 3, month_week: null };
  assert.equal(nextServiceDate('2026-11-24', wed), '2026-11-25');
  assert.equal(nextServiceDate('2026-11-25', wed), '2026-11-25');
  assert.equal(nextServiceDate('2026-11-24', { weekday: 0, month_week: null }), '2026-11-29');
  // AWAKE(1주차 금): 11월 마지막 금요일 11/27에서 12/4로
  assert.equal(nextServiceDate('2026-11-27', { weekday: 5, month_week: 1 }), '2026-12-04');
  // WORSHIP NIGHT(마지막 주 금): 11/27
  assert.equal(nextServiceDate('2026-11-24', { weekday: 5, month_week: -1 }), '2026-11-27');
});

test('요일·주차 규칙은 serviceOccursOn과 같다', () => {
  const scheds = [{ weekday: 0, month_week: null }, { weekday: 3, month_week: null }, ...[1, 2, 3, 4, 5, -1].map(w => ({ weekday: 5, month_week: w }))];
  const start = new Date('2026-01-01T00:00:00Z');
  for (let i = 0; i < 400; i++) {
    const d = new Date(start.getTime() + i * 864e5).toISOString().slice(0, 10);
    for (const s of scheds) assert.equal(occursOn(d, s), serviceOccursOn(d, s), `${d} ${JSON.stringify(s)}`);
  }
});

test('큐시트 이름표: 주일 이름표를 복제한 양식만 고친다', () => {
  assert.equal(cueLabelFor('sun2', '2nd.', '주일 2부', { weekday: 0, month_week: null }), '2nd.');
  assert.equal(cueLabelFor('sx', '2nd.', '수요예배', { weekday: 3, month_week: null }), 'WEDNESDAY');
  assert.equal(cueLabelFor('sx', 'LIFELINE', 'AWAKE', { weekday: 5, month_week: 1 }), 'AWAKE');
  assert.equal(cueLabelFor('sx', 'LIFELINE', '워십나잇 WORSHIP NIGHT', { weekday: 5, month_week: -1 }), 'WORSHIP NIGHT');
  assert.equal(cueLabelFor('sx', 'FRIDAY', '금요예배', { weekday: 5, month_week: null }), 'FRIDAY');
});

test('문구', () => {
  assert.equal(scheduleLabel({ weekday: 5, month_week: 1 }), '매달 1주차 금요일');
  assert.equal(scheduleLabel({ weekday: 5, month_week: -1 }), '매달 마지막 주 금요일');
  assert.equal(scheduleLabel({ weekday: 3, month_week: null }), '매주 수요일');
  assert.equal(upcomingLabel(0), '돌아오는 주일');
  assert.equal(upcomingLabel(5), '돌아오는 금요일');
  assert.deepEqual(cueDayName(0), { ko: '주일예배', en: 'Sunday Service' });
  assert.deepEqual(cueDayName(3), { ko: '수요예배', en: 'Wednesday Service' });
});
