import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serviceOccursOn } from '../src/lib/service-schedule.ts';

test('금요예배는 달력의 금요일 순서로 계산하고 5번째 금요일이 있으면 마지막 주를 구분한다', () => {
  assert.equal(serviceOccursOn('2026-10-02', {weekday:5,month_week:1}),true);
  assert.equal(serviceOccursOn('2026-10-09', {weekday:5,month_week:2}),true);
  assert.equal(serviceOccursOn('2026-10-16', {weekday:5,month_week:3}),true);
  assert.equal(serviceOccursOn('2026-10-23', {weekday:5,month_week:-1}),false);
  assert.equal(serviceOccursOn('2026-10-30', {weekday:5,month_week:-1}),true);
  assert.equal(serviceOccursOn('2026-11-27', {weekday:5,month_week:-1}),true);
  assert.equal(serviceOccursOn('2026-11-20', {weekday:5,month_week:3}),true);
});
test('주일과 수요예배는 해당 요일만 허용하고 잘못된 날짜를 거부한다', () => {
  assert.equal(serviceOccursOn('2026-10-18',{weekday:0}),true);
  assert.equal(serviceOccursOn('2026-10-14',{weekday:3}),true);
  assert.equal(serviceOccursOn('2026-10-18',{weekday:3}),false);
  assert.equal(serviceOccursOn('2026-02-30',{weekday:null}),false);
});
