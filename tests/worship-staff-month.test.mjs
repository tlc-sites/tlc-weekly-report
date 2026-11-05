import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPaste, composeStaff, monthOccurrences, parseDateCell, parseStaff, parseTable, pasteBlock, shiftMonth } from "../src/lib/worship-staff-month.ts";

const services = [
  { id: "s1", name: "1부 예배", weekday: 0, month_week: null },
  { id: "s2", name: "2부 예배", weekday: 0, month_week: null },
  { id: "wed", name: "수요예배", weekday: 3, month_week: null },
  { id: "enc", name: "인카운터 ENCOUNTER", weekday: 5, month_week: 3 },
  { id: "wn", name: "워십나잇 WORSHIP NIGHT", weekday: 5, month_week: -1 },
  { id: "x", name: "요일 없음", weekday: null, month_week: null },
];
const rows = monthOccurrences("2026-11", services);

test("한 달 예배 날짜: 요일·n번째·마지막 주", () => {
  assert.deepEqual(rows.filter(r => r.serviceId === "s1").map(r => r.date), ["2026-11-01", "2026-11-08", "2026-11-15", "2026-11-22", "2026-11-29"]);
  assert.deepEqual(rows.filter(r => r.serviceId === "enc").map(r => r.date), ["2026-11-20"]);
  assert.deepEqual(rows.filter(r => r.serviceId === "wn").map(r => r.date), ["2026-11-27"]);
  assert.equal(rows.some(r => r.serviceId === "x"), false);
  assert.deepEqual(rows.slice(0, 2).map(r => r.serviceId), ["s1", "s2"]);
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
});

test("명단 글과 칸은 서로 바뀌어도 그대로", () => {
  const text = "안내위원: 김, 이\n헌금위원: 박\n기존 기록 한 줄";
  const cells = parseStaff(text);
  assert.deepEqual(cells, { guide: "김, 이", offering: "박", reading: "", other: "기존 기록 한 줄" });
  assert.equal(composeStaff(cells), text);
});

test("날짜 형식", () => {
  for (const v of ["11/8", "11.8", "11월 8일", "2026-11-08", "2026. 11. 8.", "8일", "8", "11/8(일)"]) assert.equal(parseDateCell(v, "2026-11"), "2026-11-08", v);
  assert.equal(parseDateCell("12/8", "2026-11"), null);
  assert.equal(parseDateCell("11/31", "2026-11"), null);
});

test("탭 표: 따옴표 안 줄바꿈", () => {
  assert.deepEqual(parseTable('a\t"김\n이"\tc\nd\te\tf\n'), [["a", "김\n이", "c"], ["d", "e", "f"]]);
});

test("머리글 있는 표: 날짜·예배로 줄을 찾고 한 칸 여러 이름은 쉼표로", () => {
  const text = "날짜\t예배\t안내위원\t헌금위원\t말씀봉독\t비고\n11/1\t1부\t\"김\n이\"\t박\t최\t새가족 안내\n\t2부\t정\t강\t\t\n11/4\t수요\t윤\t\t\t";
  const { updates, unmatched } = applyPaste(text, "2026-11", rows);
  assert.deepEqual(unmatched, []);
  const at = i => updates.find(u => u.index === i)?.cells;
  const idx = (d, s) => rows.findIndex(r => r.date === d && r.serviceId === s);
  assert.deepEqual(at(idx("2026-11-01", "s1")), { guide: "김, 이", offering: "박", reading: "최", other: "비고: 새가족 안내" });
  assert.equal(at(idx("2026-11-01", "s2")).guide, "정");
  assert.equal(at(idx("2026-11-04", "wed")).guide, "윤");
});

test("예배 칸이 없으면 같은 날 예배에 순서대로, 없는 날은 알려 준다", () => {
  const text = "날짜\t안내\t헌금\n11/8\tA\tB\n11/8\tC\tD\n11/8\tE\tF\n11/9\tG\tH";
  const { updates, unmatched } = applyPaste(text, "2026-11", rows);
  assert.deepEqual(updates.map(u => rows[u.index].serviceId), ["s1", "s2"]);
  assert.equal(unmatched.length, 2);
});

test("날짜가 열 방향인 표는 뒤집어 읽는다", () => {
  const text = "\t11/1\t11/8\n안내위원\t김\t이\n헌금위원\t박\t최";
  const { updates } = applyPaste(text, "2026-11", rows);
  assert.deepEqual(updates.map(u => [rows[u.index].date, u.cells.guide, u.cells.offering]), [["2026-11-01", "김", "박"], ["2026-11-08", "이", "최"]]);
});

test("머리글 없는 표: 날짜 없으면 선택한 줄부터 차례로", () => {
  const { updates } = applyPaste("김\t박\t최\n이\t정\t", "2026-11", rows, 3);
  assert.deepEqual(updates.map(u => [u.index, u.cells.guide, u.cells.reading]), [[3, "김", "최"], [4, "이", ""]]);
  const dated = applyPaste("11/1\t1부\t김\t박\n11/1\t2부\t이\t최", "2026-11", rows);
  assert.deepEqual(dated.updates.map(u => [rows[u.index].serviceId, u.cells.guide]), [["s1", "김"], ["s2", "이"]]);
});

test("칸에 여러 칸 붙여넣기", () => {
  assert.deepEqual(pasteBlock("김\t박\n이\t정", 1, 1, 3), [{ index: 1, cells: { offering: "김", reading: "박" } }, { index: 2, cells: { offering: "이", reading: "정" } }]);
});
