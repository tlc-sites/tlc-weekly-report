import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {APP_UPDATES,visibleUpdates,guideHref} from '../src/lib/app-updates.ts';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');
const sample = [{id: 'v1', publishAt: '2026-10-26T00:00:00+09:00', title: 't', body: 'b'}];

test('업데이트 공지: 교역자·관리자는 바로, 일반 사용자는 공개 시각부터 본다', () => {
  const before = Date.parse('2026-10-25T23:59:00+09:00'), after = Date.parse('2026-10-26T00:00:00+09:00');
  assert.equal(visibleUpdates(before, false, sample).length, 0);
  assert.equal(visibleUpdates(before, true, sample).length, 1);
  assert.equal(visibleUpdates(after, false, sample).length, 1);
  assert.equal(guideHref(true), '/staff-guide.html#updates');
  assert.equal(guideHref(false), '/guide.html#updates');
});

test('업데이트 공지 버전은 고유하고, 두 사용 안내의 업데이트 소식에 같은 버전이 적혀 있다', async () => {
  assert.equal(new Set(APP_UPDATES.map((u) => u.id)).size, APP_UPDATES.length);
  const [guide, staff] = await Promise.all([read('public/guide.html'), read('public/staff-guide.html')]);
  for (const u of APP_UPDATES) {
    assert.match(u.title, new RegExp(u.id));
    assert.ok(!Number.isNaN(Date.parse(u.publishAt)));
    assert.ok(guide.includes('버전 ' + u.id) && staff.includes('버전 ' + u.id), u.id);
  }
});

test('ⓘ 도움말의 「자세히 보기」 링크는 사용 안내에 실제로 있는 칸을 가리킨다', async () => {
  const [help, guide, staff] = await Promise.all([read('src/lib/help-text.tsx'), read('public/guide.html'), read('public/staff-guide.html')]);
  const links = [...help.matchAll(/(STAFF_GUIDE|GUIDE) \+ "#([a-z-]+)"/g)];
  assert.ok(links.length >= 10);
  for (const [, page, id] of links) assert.ok((page === 'GUIDE' ? guide : staff).includes(`id="${id}"`), page + '#' + id);
});

test('사용 안내 파일은 로그인하지 않아도 열린다 (세션 갱신 matcher에서 제외)', async () => {
  // proxy.ts는 경로 별칭을 써서 직접 import할 수 없으므로 matcher 문자열만 읽는다
  const source = await read('src/proxy.ts');
  const matcher = JSON.parse(source.match(/matcher: \[\s*(?:\/\/[^\n]*\n\s*)?("(?:[^"\\]|\\.)*")/)[1]);
  const pattern = new RegExp('^' + matcher + '$');
  for (const path of ['/guide.html', '/staff-guide.html', '/guide.css', '/guide.js']) assert.equal(pattern.test(path), false, path);
  for (const path of ['/', '/notifications', '/reports/abc']) assert.equal(pattern.test(path), true, path);
});
