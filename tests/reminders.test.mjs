// 알림 대상 규칙 검증. 실행: npm run test:db
import { test } from "node:test";
import assert from "node:assert/strict";
import { adminTargets, digestTargets, missingGroups, reminderTargets, summarizeNames } from "../src/lib/reminder-targets.ts";

const groups = [
  { id: "edu", label: "교육부", parent_id: null, schedule: "irregular", is_active: true },
  { id: "mid", label: "교육부 · 중등부", parent_id: "edu", schedule: "weekly", is_active: true },
  { id: "high", label: "교육부 · 고등부", parent_id: "edu", schedule: "weekly", is_active: true },
  { id: "kids", label: "교육부 · 유치부", parent_id: "edu", schedule: "weekly", is_active: true },
  { id: "old", label: "교육부 · 유아부", parent_id: "edu", schedule: "weekly", is_active: false },
  { id: "busan", label: "부산 캠퍼스", parent_id: null, schedule: "irregular", is_active: true },
  { id: "sound", label: "예배팀 · 음향", parent_id: "worship", schedule: "weekly", is_active: true },
  { id: "worship", label: "예배팀", parent_id: null, schedule: "irregular", is_active: true },
];

test("미제출 그룹: 제출·확인 보고가 있거나 모임 없음이면 제외, 임시저장만 있으면 미제출", () => {
  const reports = [
    { group_id: "mid", status: "submitted" },
    { group_id: "high", status: "draft" },
    { group_id: "sound", status: "reviewed" },
  ];
  const missing = missingGroups(groups, reports, new Set(["kids"]));
  // 상위 그룹(교육부·예배팀), 비정기(부산), 비활성(유아부)은 대상이 아니다
  assert.deepEqual(missing.map((g) => g.id), ["high"]);
});

test("미제출 알림: 직접 소속자에게만, 알림 끈 사람·비활성 사용자 제외, 그룹 이름을 모은다", () => {
  const missing = groups.filter((g) => ["mid", "high"].includes(g.id));
  const memberships = [
    { user_id: "t1", group_id: "mid", role: "writer" },
    { user_id: "t1", group_id: "high", role: "writer" },
    { user_id: "t2", group_id: "high", role: "reviewer" },
    { user_id: "off", group_id: "mid", role: "writer" },
    { user_id: "gone", group_id: "mid", role: "writer" },
    { user_id: "pastor", group_id: "edu", role: "reviewer" }, // 상위 그룹 검토자는 독촉하지 않는다
  ];
  const users = [
    { id: "t1", status: "active", is_admin: false, notify_enabled: true },
    { id: "t2", status: "active", is_admin: false, notify_enabled: true },
    { id: "off", status: "active", is_admin: false, notify_enabled: false },
    { id: "gone", status: "disabled", is_admin: false, notify_enabled: true },
    { id: "pastor", status: "active", is_admin: false, notify_enabled: true },
  ];
  const targets = reminderTargets(missing, memberships, users);
  assert.deepEqual(Object.fromEntries(targets), {
    t1: ["교육부 · 중등부", "교육부 · 고등부"],
    t2: ["교육부 · 고등부"],
  });
});

test("관리자 요약과 화요일 회의 알림 대상", () => {
  const users = [
    { id: "admin", status: "active", is_admin: true, notify_enabled: true },
    { id: "adminOff", status: "active", is_admin: true, notify_enabled: false },
    { id: "rev", status: "active", is_admin: false, notify_enabled: true },
    { id: "writer", status: "active", is_admin: false, notify_enabled: true },
  ];
  const memberships = [
    { user_id: "rev", group_id: "edu", role: "reviewer" },
    { user_id: "writer", group_id: "mid", role: "writer" },
  ];
  assert.deepEqual(adminTargets(users), ["admin"]);
  assert.deepEqual(digestTargets(memberships, users), ["admin", "rev"]);
});

test("그룹 이름 요약", () => {
  assert.equal(summarizeNames(["중등부"]), "중등부");
  assert.equal(summarizeNames(["중등부", "음향"]), "중등부, 음향");
  assert.equal(summarizeNames(["중등부", "음향", "영상", "조명"]), "중등부, 음향 외 2곳");
});

test("기술팀은 주간으로 설정돼 있어도 모임 없음·미제출 독촉에서 제외한다", () => {
  const missing = missingGroups([{id:'sound',type:'worship',label:'음향팀',parent_id:null,schedule:'weekly',is_active:true},{id:'school',type:'other',label:'학교',parent_id:null,schedule:'weekly',is_active:true}],[],new Set());
  assert.deepEqual(missing.map(g=>g.id),['school']);
});
