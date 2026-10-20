import { test } from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import { reportWeek,weekOf,dateInWeek,formatWeek,reportDateMax,reportDeadline } from '../src/lib/week.ts';

test('일~토: 이번 주 일요일 기준, 미래 주차 URL은 현재 주차로 제한', () => {
  assert.equal(reportWeek(undefined,'2026-10-19'),'2026-10-18');
  assert.equal(reportWeek('2026-10-25','2026-10-19'),'2026-10-18');
  assert.equal(reportWeek('2027-01-03','2026-10-19'),'2026-10-18');
  assert.equal(reportWeek('2026-10-12','2026-10-19'),'2026-10-11');
  assert.equal(reportWeek('2026-10-11','2026-10-19'),'2026-10-11');
  assert.equal(reportWeek(undefined,'2026-10-18'),'2026-10-18');
});

test('10/18 주일·10/21 수요일·10/24 토요일은 같은 주, 10/25는 다음 주',()=>{
  for(const day of ['2026-10-18','2026-10-21','2026-10-24']) assert.equal(weekOf(day),'2026-10-18');
  assert.equal(weekOf('2026-10-25'),'2026-10-25');
  assert.equal(formatWeek('2026-10-18'),'10/18(일) ~ 10/24(토)');
  assert.equal(dateInWeek('2026-10-18',0),'2026-10-18');
  assert.equal(dateInWeek('2026-10-18',3),'2026-10-21');
  assert.equal(dateInWeek('2026-10-18',5),'2026-10-23');
  assert.equal(reportDateMax('2026-10-18','2026-10-20'),'2026-10-20');
  assert.equal(reportDateMax('2026-10-11','2026-10-20'),'2026-10-17');
  assert.equal(weekOf('2027-01-01'),'2026-12-27');
  assert.equal(reportDeadline('2026-10-18').toISOString(),'2026-10-23T07:59:59.000Z');
});

test('금요일 오후 5시 안내 크론은 UTC 금요일 08:00, 주중 독촉은 수·금 오전 9시',()=>{
  const {crons}=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.deepEqual(crons,[
    {path:'/api/cron/wed-am',schedule:'0 0 * * 3'},
    {path:'/api/cron/fri-am',schedule:'0 0 * * 5'},
    {path:'/api/cron/fri-digest',schedule:'0 8 * * 5'},
  ]);
});
