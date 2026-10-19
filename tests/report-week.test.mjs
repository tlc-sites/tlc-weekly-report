import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportWeek } from '../src/lib/week.ts';

test('월요일 기본 주차는 어제 일요일, 미래 주차 URL도 가장 최근 완료 주차로 제한', () => {
  assert.equal(reportWeek(undefined,'2026-10-19'),'2026-10-18');
  assert.equal(reportWeek('2026-10-25','2026-10-19'),'2026-10-18');
  assert.equal(reportWeek('2027-01-03','2026-10-19'),'2026-10-18');
  assert.equal(reportWeek('2026-10-12','2026-10-19'),'2026-10-18');
  assert.equal(reportWeek('2026-10-11','2026-10-19'),'2026-10-11');
  assert.equal(reportWeek(undefined,'2026-10-18'),'2026-10-18');
});
