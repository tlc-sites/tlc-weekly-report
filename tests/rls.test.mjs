// 마이그레이션을 실제 Postgres(PGlite)에 적용하고 역할별 권한(RLS)을 검증한다.
// 실행: npm run test:db
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { SUPABASE_STUB } from "./stub.mjs";

const root = join(import.meta.dirname, "..");
const migrationsDir = join(root, "supabase", "migrations");


let db;
const ids = {};

// 셀케어 계정 생성. rosterName이 있으면 셀케어 교인 명단에 연결된 사람이다.
async function createAccount(rosterName) {
  const id = randomUUID();
  const email = `${id.slice(0, 8)}@example.com`;
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  if (rosterName) {
    await db.query("insert into public.profiles (name, email, auth_user_id) values ($1, $2, $3)", [rosterName, email, id]);
  }
  return id;
}

// 보고 앱에 처음 로그인 (승인 대기 프로필 생성)
async function signUp(rosterName) {
  const id = await createAccount(rosterName);
  await as(id, "select report.ensure_profile()");
  return id;
}

// 특정 사용자로 로그인한 상태에서 쿼리 실행 (트랜잭션 단위로 역할 전환)
async function as(userId, sql, params = []) {
  return db.transaction(async (tx) => {
    if (userId) {
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    } else {
      await tx.exec("set local role anon");
    }
    return tx.query(sql, params);
  });
}

async function rejects(promise, pattern) {
  await assert.rejects(promise, (err) => {
    if (pattern && !pattern.test(err.message)) {
      throw new Error(`예상과 다른 오류: ${err.message}`);
    }
    return true;
  });
}

async function groupId(name) {
  const { rows } = await db.query("select id from report.groups where name = $1", [name]);
  return rows[0].id;
}

before(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  // 12번까지의 기존 운영 동작 회귀 검사. 새 권한으로 바뀌는 기대값은 roles.test.mjs에서
  // 기존 자료가 들어 있는 DB를 13번으로 업그레이드한 뒤 별도로 검증한다.
  for (const file of readdirSync(migrationsDir).sort().filter(f => f < "20261027000000")) {
    await db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  }
  const seed = readFileSync(join(root, "supabase", "seed.sql"), "utf8");
  await db.exec(seed);
  await db.exec(seed); // 두 번 실행해도 중복되지 않아야 한다

  ids.admin = await signUp("관리자");
  ids.teacherA = await signUp("교사A");
  ids.teacherB = await signUp("교사B");
  ids.eduReviewer = await signUp("교육부목사");
  ids.techWriter = await signUp("음향팀원");
  ids.pending = await signUp("대기자");
  ids.noRoster = await signUp(null);
  ids.cellcareOnly = await createAccount("셀케어만 쓰는 사람");

  // 첫 관리자는 SQL 편집기에서 직접 지정한다 (운영 절차와 동일)
  await db.query("update report.profiles set status = 'active', is_admin = true where id = $1", [ids.admin]);

  ids.youth = await groupId("중등부");
  ids.elem = await groupId("초등부");
  ids.edu = await groupId("교육부");
  ids.sound = await groupId("음향팀");

  const approve = (user, assignments) =>
    as(ids.admin, "select report.approve_user($1, $2::jsonb)", [user, JSON.stringify(assignments)]);
  await approve(ids.teacherA, [{ group_id: ids.youth, role: "writer" }]);
  await approve(ids.teacherB, [{ group_id: ids.youth, role: "writer" }]);
  await approve(ids.eduReviewer, [{ group_id: ids.edu, role: "reviewer" }]);
  await approve(ids.techWriter, [{ group_id: ids.sound, role: "writer" }]);
});

test("시드: 중복 없이 그룹 25개(교육부서 8, 예배팀 12, 학교 2, 부산), 예배 9개가 생성된다", async () => {
  const groups = await db.query("select count(*)::int as n from report.groups");
  const services = await db.query("select count(*)::int as n from report.service_types");
  const worshipLinks = await db.query("select count(*)::int as n from report.group_service_types");
  const campus = await db.query("select type from report.groups where name = '부산 캠퍼스'");
  assert.equal(groups.rows[0].n, 25);
  assert.equal(services.rows[0].n, 9);
  // 예배팀 11곳 × 예배 9개 + PD 4개
  assert.equal(worshipLinks.rows[0].n, 103);
  assert.equal(campus.rows[0].type, "campus");
});

test("첫 로그인: 승인 대기 프로필이 생기고 셀케어 명단 이름이 미리 채워진다", async () => {
  const { rows } = await db.query("select status, real_name, is_admin, email is not null as has_email from report.profiles where id = $1", [ids.pending]);
  assert.deepEqual(rows[0], { status: "pending", real_name: "대기자", is_admin: false, has_email: true });

  const noRoster = await db.query("select real_name from report.profiles where id = $1", [ids.noRoster]);
  assert.equal(noRoster.rows[0].real_name, null);
});

test("셀케어만 쓰는 사람은 보고 앱 프로필이 생기지 않는다", async () => {
  const { rows } = await db.query("select count(*)::int as n from report.profiles where id = $1", [ids.cellcareOnly]);
  assert.equal(rows[0].n, 0);
});

test("다시 로그인해도 승인 상태와 입력한 이름이 그대로다", async () => {
  await as(ids.admin, "select report.ensure_profile()");
  const { rows } = await db.query("select status, is_admin from report.profiles where id = $1", [ids.admin]);
  assert.deepEqual(rows[0], { status: "active", is_admin: true });
});

test("익명 사용자는 프로필 생성 함수를 호출할 수 없다", async () => {
  await rejects(as(null, "select report.ensure_profile()"), /permission denied/);
});

test("보고 앱은 셀케어 테이블을 바꾸지 않는다", async () => {
  const { rows } = await db.query("select count(*)::int as n from public.profiles");
  assert.equal(rows[0].n, 7);
});

test("익명 사용자는 그룹 목록도 볼 수 없다", async () => {
  await rejects(as(null, "select * from report.groups"), /permission denied/);
});

test("승인 대기자: 그룹 목록만 보이고 다른 사람 프로필과 예배 목록은 안 보인다", async () => {
  const groups = await as(ids.pending, "select id from report.groups");
  assert.equal(groups.rows.length, 25);
  const profiles = await as(ids.pending, "select id from report.profiles");
  assert.deepEqual(profiles.rows.map((r) => r.id), [ids.pending]);
  const services = await as(ids.pending, "select id from report.service_types");
  assert.equal(services.rows.length, 0);
});

test("승인 대기자: 실명과 희망 그룹은 바꿀 수 있지만 상태와 관리자 여부는 바꿀 수 없다", async () => {
  await as(ids.pending, "update report.profiles set real_name = '홍길동', requested_group_ids = $1 where id = $2", [
    [ids.youth],
    ids.pending,
  ]);
  const { rows } = await db.query("select real_name from report.profiles where id = $1", [ids.pending]);
  assert.equal(rows[0].real_name, "홍길동");

  await rejects(as(ids.pending, "update report.profiles set status = 'active' where id = $1", [ids.pending]), /permission denied/);
  await rejects(as(ids.pending, "update report.profiles set is_admin = true where id = $1", [ids.pending]), /permission denied/);
});

test("관리자가 아니면 가입 승인 RPC를 쓸 수 없다", async () => {
  await rejects(
    as(ids.teacherA, "select report.approve_user($1, '[]'::jsonb)", [ids.pending]),
    /forbidden/,
  );
  await rejects(as(ids.teacherA, "select report.set_user_status($1, 'active')", [ids.pending]), /forbidden/);
});

test("다른 사람의 프로필 이름은 바꿀 수 없다", async () => {
  const res = await as(ids.teacherA, "update report.profiles set real_name = '변경' where id = $1", [ids.teacherB]);
  assert.equal(res.affectedRows, 0);
});

test("주차는 그 주(일~토)의 시작 일요일로 계산된다", async () => {
  const { rows } = await db.query(`
    select d::date as d, (d::date - extract(dow from d::date)::int)::text as week
    from unnest(array['2026-10-12', '2026-10-14', '2026-10-16', '2026-10-18', '2026-10-19']) d`);
  assert.deepEqual(rows.map((r) => r.week), ["2026-10-11", "2026-10-11", "2026-10-11", "2026-10-18", "2026-10-18"]);
});

test("보고 작성 권한: 소속 그룹에만, 확인 상태로는 작성 불가", async () => {
  const insert = (user, group, status = "draft") =>
    as(
      user,
      `insert into report.reports (group_id, author_id, meeting_date, meeting_label, status)
       values ($1, $2, '2026-10-18', '주일예배', $3) returning id, week::text`,
      [group, user, status],
    );

  const ok = await insert(ids.teacherA, ids.youth, "submitted");
  ids.report = ok.rows[0].id;
  assert.equal(ok.rows[0].week, "2026-10-18");

  await rejects(insert(ids.teacherA, ids.elem), /row-level security/);
  await rejects(insert(ids.teacherA, ids.youth, "reviewed"), /row-level security/);
  await rejects(
    as(
      ids.teacherA,
      `insert into report.reports (group_id, author_id, meeting_date, meeting_label) values ($1, $2, '2026-10-18', 'x')`,
      [ids.youth, ids.teacherB],
    ),
    /row-level security/,
  );
});

test("보고 열람: 같은 부서와 상위 부서 검토자는 보고, 다른 팀은 못 본다", async () => {
  const sql = "select id from report.reports where id = $1";
  assert.equal((await as(ids.teacherA, sql, [ids.report])).rows.length, 1);
  assert.equal((await as(ids.teacherB, sql, [ids.report])).rows.length, 1);
  assert.equal((await as(ids.eduReviewer, sql, [ids.report])).rows.length, 1);
  assert.equal((await as(ids.techWriter, sql, [ids.report])).rows.length, 0);
  assert.equal((await as(ids.pending, sql, [ids.report])).rows.length, 0);
});

test("기도제목: 작성자 본인과 검토자만 본다 (같은 부서 다른 교사는 못 봄)", async () => {
  await as(ids.teacherA, "insert into report.report_prayers (report_id, body) values ($1, '기도제목')", [ids.report]);
  const sql = "select body from report.report_prayers where report_id = $1";
  assert.equal((await as(ids.teacherA, sql, [ids.report])).rows.length, 1);
  assert.equal((await as(ids.teacherB, sql, [ids.report])).rows.length, 0);
  assert.equal((await as(ids.eduReviewer, sql, [ids.report])).rows.length, 1);
});

test("같은 부서 다른 교사는 남의 보고를 수정할 수 없다", async () => {
  const res = await as(ids.teacherB, "update report.reports set details = '{\"x\":1}' where id = $1", [ids.report]);
  assert.equal(res.affectedRows, 0);
});

test("작성자는 스스로 확인 처리할 수 없다", async () => {
  await rejects(
    as(ids.teacherA, "update report.reports set status = 'reviewed' where id = $1", [ids.report]),
    /row-level security/,
  );
});

test("명단: 교사는 새친구만 추가, 보호자 연락처는 입력만 하고 열람은 검토자만", async () => {
  await rejects(
    as(ids.teacherA, "insert into report.members (group_id, name, status) values ($1, '김학생', 'active')", [ids.youth]),
    /row-level security/,
  );
  const newcomer = await as(
    ids.teacherA,
    "insert into report.members (group_id, name, status, first_visit_date) values ($1, '이새친구', 'newcomer', '2026-10-18') returning id",
    [ids.youth],
  );
  const memberId = newcomer.rows[0].id;

  await as(
    ids.teacherA,
    "insert into report.member_guardians (member_id, slot, name, relation, contact, consent) values ($1, 1, '이보호자', '모', '010-0000-0000', true)",
    [memberId],
  );
  const sql = "select contact from report.member_guardians where member_id = $1";
  assert.equal((await as(ids.teacherA, sql, [memberId])).rows.length, 0);
  assert.equal((await as(ids.eduReviewer, sql, [memberId])).rows.length, 1);
  assert.equal((await as(ids.techWriter, "select id from report.members where id = $1", [memberId])).rows.length, 0);

  // 출석 기록은 보고 수정 권한을 따른다
  await as(ids.teacherA, "insert into report.attendance (report_id, member_id, present) values ($1, $2, true)", [
    ids.report,
    memberId,
  ]);
  await rejects(
    as(ids.techWriter, "insert into report.attendance (report_id, member_id, present) values ($1, $2, true)", [
      ids.report,
      memberId,
    ]),
    /row-level security/,
  );
});

test("검토자가 확인하면 확인자와 시각이 기록되고, 작성자는 더 이상 수정할 수 없다", async () => {
  await as(ids.eduReviewer, "update report.reports set status = 'reviewed' where id = $1", [ids.report]);
  const { rows } = await db.query("select reviewed_by, reviewed_at, submitted_at from report.reports where id = $1", [ids.report]);
  assert.equal(rows[0].reviewed_by, ids.eduReviewer);
  assert.ok(rows[0].reviewed_at);
  assert.ok(rows[0].submitted_at);

  const res = await as(ids.teacherA, "update report.reports set details = '{\"x\":1}' where id = $1", [ids.report]);
  assert.equal(res.affectedRows, 0);
  const prayer = await as(ids.teacherA, "update report.report_prayers set body = '수정' where report_id = $1", [ids.report]);
  assert.equal(prayer.affectedRows, 0);
});

test("비활성화된 사용자는 소속이 남아 있어도 아무것도 볼 수 없다", async () => {
  await as(ids.admin, "select report.set_user_status($1, 'disabled')", [ids.teacherB]);
  assert.equal((await as(ids.teacherB, "select id from report.reports")).rows.length, 0);
  assert.equal((await as(ids.teacherB, "select id from report.members")).rows.length, 0);
});

test("관리자는 자기 자신을 비활성화할 수 없다", async () => {
  await rejects(as(ids.admin, "select report.set_user_status($1, 'disabled')", [ids.admin]), /cannot change own status/);
});

test("발송 기록 테이블은 일반 사용자가 읽거나 쓸 수 없다", async () => {
  assert.equal((await as(ids.admin, "select * from report.notification_logs")).rows.length, 0);
  await rejects(
    as(ids.admin, "insert into report.notification_logs (user_id, week, slot) values ($1, '2026-10-18', 'mon_am')", [ids.admin]),
    /row-level security/,
  );
});

// ───────────── 2단계: 관리자 도구 ─────────────

test("그룹: 관리자만 추가, 2단계 계층과 같은 유형만 허용", async () => {
  const add = (user, type, name, parent) =>
    as(user, "insert into report.groups (type, name, parent_id) values ($1, $2, $3) returning id", [type, name, parent]);

  const ok = await add(ids.admin, "education", "청소년부", ids.edu);
  assert.equal(ok.rows.length, 1);
  await rejects(add(ids.admin, "education", "3단계", ids.youth), /하위 그룹 아래에는/);
  await rejects(add(ids.admin, "worship", "유형 다름", ids.edu), /유형이 같아야/);
  await rejects(add(ids.eduReviewer, "education", "검토자가 추가", ids.edu), /row-level security/);
  await rejects(
    as(ids.admin, "update report.groups set parent_id = $1 where id = $2", [ids.youth, ids.edu]),
    /하위 그룹 아래에는|하위 그룹이 있는 그룹은/,
  );
  await rejects(as(ids.admin, "update report.groups set type = 'worship' where id = $1", [ids.edu]), /유형을 바꿀 수 없습니다/);
});

test("소속 일괄 변경: 관리자만, 기존 소속은 전부 교체된다", async () => {
  await as(ids.admin, "select report.set_memberships($1, $2::jsonb)", [
    ids.teacherA,
    JSON.stringify([
      { group_id: ids.youth, role: "reviewer" },
      { group_id: ids.sound, role: "writer" },
    ]),
  ]);
  const { rows } = await db.query(
    "select g.name, m.role from report.memberships m join report.groups g on g.id = m.group_id where m.user_id = $1 order by g.name",
    [ids.teacherA],
  );
  assert.deepEqual(rows, [
    { name: "음향팀", role: "writer" },
    { name: "중등부", role: "reviewer" },
  ]);
  await rejects(
    as(ids.eduReviewer, "select report.set_memberships($1, '[]'::jsonb)", [ids.teacherA]),
    /forbidden/,
  );
});

test("관리자 지정: 관리자만, 자기 관리자 권한은 해제할 수 없다", async () => {
  await rejects(as(ids.admin, "select report.set_user_admin($1, false)", [ids.admin]), /cannot remove own admin/);
  await rejects(as(ids.eduReviewer, "select report.set_user_admin($1, true)", [ids.eduReviewer]), /forbidden/);

  await as(ids.admin, "select report.set_user_admin($1, true)", [ids.eduReviewer]);
  const { rows } = await db.query("select is_admin from report.profiles where id = $1", [ids.eduReviewer]);
  assert.equal(rows[0].is_admin, true);
  await as(ids.admin, "select report.set_user_admin($1, false)", [ids.eduReviewer]);
});

test("명단: 상위 부서 검토자는 학생을 다른 부서로 옮길 수 있고, 다른 팀은 못 옮긴다", async () => {
  const added = await as(
    ids.eduReviewer,
    "insert into report.members (group_id, name) values ($1, '박학생') returning id",
    [ids.elem],
  );
  const memberId = added.rows[0].id;

  const moved = await as(ids.eduReviewer, "update report.members set group_id = $1 where id = $2", [ids.youth, memberId]);
  assert.equal(moved.affectedRows, 1);

  // 음향 파트 작성자는 교육부 명단을 바꿀 수 없다
  const res = await as(ids.techWriter, "update report.members set name = '변경' where id = $1", [memberId]);
  assert.equal(res.affectedRows, 0);
});

test("예배 목록: 관리자만 바꿀 수 있다", async () => {
  const res = await as(ids.eduReviewer, "update report.service_types set name = '변경' where name = '1부 예배'");
  assert.equal(res.affectedRows, 0);
  const ok = await as(ids.admin, "update report.service_types set sort_order = 10 where name = '1부 예배'");
  assert.equal(ok.affectedRows, 1);
});

// ───────────── 3차: 담임목사님·사모님께 드리는 글, 언어 설정 ─────────────

test("받는 분 지정: 관리자만, 같은 역할은 한 명만", async () => {
  await rejects(as(ids.teacherA, "select report.set_recipient_role($1, 'pastor')", [ids.teacherA]), /forbidden/);

  await as(ids.admin, "select report.set_recipient_role($1, 'pastor')", [ids.teacherA]);
  // 다른 사람으로 바꾸면 이전 지정은 풀린다
  await as(ids.admin, "select report.set_recipient_role($1, 'pastor')", [ids.eduReviewer]);
  await as(ids.admin, "select report.set_recipient_role($1, 'pastor_wife')", [ids.techWriter]);
  const { rows } = await db.query(
    "select recipient_role from report.profiles where id in ($1, $2, $3) order by recipient_role nulls first",
    [ids.teacherA, ids.eduReviewer, ids.techWriter],
  );
  assert.deepEqual(rows.map((r) => r.recipient_role), [null, "pastor", "pastor_wife"]);
});

test("담임목사님·사모님께 드리는 글: 작성자와 받는 분만 보고, 관리자도 못 본다", async () => {
  const report = await as(
    ids.teacherA,
    "insert into report.reports (group_id, author_id, meeting_date, meeting_label) values ($1, $2, '2026-10-18', '주일예배') returning id",
    [ids.youth, ids.teacherA],
  );
  const rid = report.rows[0].id;
  await as(
    ids.teacherA,
    "insert into report.report_messages (report_id, recipient, body) values ($1, 'pastor', '목사님께'), ($1, 'pastor_wife', '사모님께')",
    [rid],
  );

  const sql = "select recipient from report.report_messages where report_id = $1 order by recipient";
  assert.deepEqual((await as(ids.teacherA, sql, [rid])).rows.map((r) => r.recipient), ["pastor", "pastor_wife"]);
  assert.deepEqual((await as(ids.eduReviewer, sql, [rid])).rows.map((r) => r.recipient), ["pastor"]);
  assert.deepEqual((await as(ids.techWriter, sql, [rid])).rows.map((r) => r.recipient), ["pastor_wife"]);
  assert.equal((await as(ids.admin, sql, [rid])).rows.length, 0);

  // 검토자(=담임목사님)라도 작성자가 아니면 글을 고칠 수 없다
  const edit = await as(ids.eduReviewer, "update report.report_messages set body = '수정' where report_id = $1", [rid]);
  assert.equal(edit.affectedRows, 0);
  await rejects(
    as(ids.admin, "insert into report.report_messages (report_id, recipient, body) values ($1, 'pastor', '대신 작성')", [rid]),
    /row-level security/,
  );
});

test("언어 설정은 본인이 바꿀 수 있고 ko/en만 허용", async () => {
  await as(ids.teacherA, "update report.profiles set locale = 'en' where id = $1", [ids.teacherA]);
  const { rows } = await db.query("select locale from report.profiles where id = $1", [ids.teacherA]);
  assert.equal(rows[0].locale, "en");
  await rejects(as(ids.teacherA, "update report.profiles set locale = 'jp' where id = $1", [ids.teacherA]), /check constraint/);
});

// ───────────── 4차: 보고 저장 RPC ─────────────

async function memberId(name) {
  const { rows } = await db.query("select id from report.members where name = $1", [name]);
  return rows[0].id;
}

async function newReport(user, groupId, label = "주일예배") {
  const { rows } = await as(
    user,
    "insert into report.reports (group_id, author_id, meeting_date, meeting_label) values ($1, $2, (now() at time zone 'Asia/Seoul')::date, $3) returning id",
    [groupId, user, label],
  );
  return rows[0].id;
}

const save = (user, rid, payload, status = "submitted") =>
  as(user, "select report.save_report($1, $2::jsonb, $3)", [rid, JSON.stringify(payload), status]);

test("보고 저장(교육부서): 새친구 등록, 출석, 기도제목, 글, 재적·출석 수가 한 번에 저장된다", async () => {
  ids.teacherC = await signUp("교사C");
  await as(ids.admin, "select report.approve_user($1, $2::jsonb)", [
    ids.teacherC,
    JSON.stringify([{ group_id: ids.youth, role: "writer" }]),
  ]);
  const rid = await newReport(ids.teacherC, ids.youth);
  const park = await memberId("박학생");

  await save(ids.teacherC, rid, {
    details: { sermon_passage: "요 3:16" },
    attendance: [{ member_id: park, present: false, absence_reason: "감기", contacted: true }],
    newcomers: [
      { name: "최새친구", grade: "중1", guardian_name: "최보호자", guardian_relation: "모", guardian_contact: "010-1111-2222", consent: true },
    ],
    prayer: "기도제목",
    messages: { pastor: "목사님께 드리는 글", pastor_wife: "" },
  });

  const report = await db.query("select status, submitted_at, details, enrolled_snapshot, attend_snapshot from report.reports where id = $1", [rid]);
  assert.equal(report.rows[0].status, "submitted");
  assert.ok(report.rows[0].submitted_at);
  assert.deepEqual(report.rows[0].details, { sermon_passage: "요 3:16" });

  const newcomer = await db.query(
    "select m.status, m.first_visit_date::text as d, m.follow_up_status, a.present from report.members m join report.attendance a on a.member_id = m.id and a.report_id = $1 where m.name = '최새친구'",
    [rid],
  );
  const meetingDate=(await db.query("select meeting_date::text d from report.reports where id=$1",[rid])).rows[0].d;
  assert.deepEqual(newcomer.rows[0], { status: "newcomer", d: meetingDate, follow_up_status: "new", present: true });

  const absent = await db.query("select present, absence_reason, contacted from report.attendance where report_id = $1 and member_id = $2", [rid, park]);
  assert.deepEqual(absent.rows[0], { present: false, absence_reason: "감기", contacted: true });

  // 중등부 재적 학생(활동+새친구) 중 이번 보고 출석은 새친구 1명
  const enrolled = await db.query(
    "select count(*)::int as n from report.members where group_id = $1 and kind = 'student' and status in ('active', 'newcomer')",
    [ids.youth],
  );
  assert.equal(report.rows[0].enrolled_snapshot, enrolled.rows[0].n);
  assert.equal(report.rows[0].attend_snapshot, 1);

  const prayer = await db.query("select body from report.report_prayers where report_id = $1", [rid]);
  assert.equal(prayer.rows[0].body, "기도제목");
  const messages = await db.query("select recipient from report.report_messages where report_id = $1", [rid]);
  assert.deepEqual(messages.rows.map((r) => r.recipient), ["pastor"]);
  ids.eduReport = rid;
});

test("보고 저장: 동의 없는 보호자 연락처가 있으면 전체가 취소된다", async () => {
  const before = await db.query("select count(*)::int as n from report.members");
  await rejects(
    save(ids.teacherC, ids.eduReport, {
      details: { sermon_passage: "바뀌면 안 됨" },
      newcomers: [{ name: "동의없음", guardian_contact: "010-0000-0000", consent: false }],
    }),
    /guardian consent required/,
  );
  const after = await db.query("select count(*)::int as n from report.members");
  assert.equal(after.rows[0].n, before.rows[0].n);
  const report = await db.query("select details from report.reports where id = $1", [ids.eduReport]);
  assert.deepEqual(report.rows[0].details, { sermon_passage: "요 3:16" });
});

test("보고 저장: 다른 부서 학생의 출석은 거부, 남의 보고는 저장 불가", async () => {
  const other = await as(ids.eduReviewer, "insert into report.members (group_id, name) values ($1, '초등학생') returning id", [ids.elem]);
  await rejects(
    save(ids.teacherC, ids.eduReport, { attendance: [{ member_id: other.rows[0].id, present: true }] }),
    /member not in group/,
  );
  await rejects(save(ids.techWriter, ids.eduReport, { details: {} }), /report not found|forbidden/);
});

test("보고 저장(예배팀): 이전 클라이언트의 이슈 배열은 무시하고 통합 이슈를 보존한다", async () => {
  const rid = await newReport(ids.techWriter, ids.sound, "1부 예배");
  await db.query("update report.reports set meeting_date=(now() at time zone 'Asia/Seoul')::date where id=$1",[rid]);
  await save(ids.techWriter, rid, {
    details: { result: "minor" },
    issues: [
      { category: "장비", content: "무선 마이크 끊김", status: "open", action: "" },
      { category: "인력", content: "인원 부족", status: "resolved", action: "지원 요청" },
    ],
  }, "draft");
  const legacy = await db.query("select id from report.report_issues where report_id=$1",[rid]);
  assert.equal(legacy.rows.length,0);
  const r=(await db.query("select meeting_date::text,service_type_id from report.reports where id=$1",[rid])).rows[0];
  const issue=(await as(ids.techWriter,"insert into report.worship_incidents(author_id,report_id,group_ids,occurred_on,service_id,service_name,title,circumstances,detailed,status) values($1,$2,$3,$4,$5,'예배','장비 점검','현장 점검',false,'resolved') returning id",[ids.techWriter,rid,[ids.sound],r.meeting_date,r.service_type_id])).rows[0].id;

  await save(ids.techWriter, rid, { details: { result: "normal" }, issues: [{ category: "진행·큐시트", content: "순서 변경", status: "temporary", action: "" }] });
  assert.equal((await db.query("select status from report.worship_incidents where id=$1",[issue])).rows[0].status,'resolved');
  await rejects(as(ids.techWriter,"insert into report.report_issues(report_id,category,content) values($1,'장비','중복')",[rid]),/통합된 팀 이슈/);
});

test("보고 저장: 검토자가 저장해도 작성자의 글은 건드리지 않는다", async () => {
  await save(ids.eduReviewer, ids.eduReport, { details: { sermon_passage: "검토자 수정" }, messages: { pastor: "" } });
  const messages = await db.query("select body from report.report_messages where report_id = $1 and recipient = 'pastor'", [ids.eduReport]);
  assert.equal(messages.rows[0].body, "목사님께 드리는 글");
});

// ───────────── 5차: 웹 푸시 ─────────────

test("푸시 구독: 같은 기기를 다른 사람이 구독하면 그 사람 것으로 바뀌고, 남의 구독은 볼 수 없다", async () => {
  const sub = (user, endpoint) =>
    as(user, "select report.save_push_subscription($1, 'p256dh-key', 'auth-key', 'Chrome')", [endpoint]);
  await sub(ids.teacherC, "https://push.example.com/device-1");
  await sub(ids.techWriter, "https://push.example.com/device-1");

  const { rows } = await db.query("select user_id from report.push_subscriptions where endpoint = 'https://push.example.com/device-1'");
  assert.deepEqual(rows.map((r) => r.user_id), [ids.techWriter]);
  assert.equal((await as(ids.teacherC, "select id from report.push_subscriptions")).rows.length, 0);

  await rejects(sub(ids.pending, "https://push.example.com/device-2"), /forbidden/);
  await rejects(sub(ids.teacherC, "http://not-https.example.com"), /invalid subscription/);
});

test("알림 설정 현황: 관리자에게만 보인다", async () => {
  const admin = await as(ids.admin, "select real_name, devices from report.push_status() where user_id = $1", [ids.techWriter]);
  assert.deepEqual(admin.rows[0], { real_name: "음향팀원", devices: 1 });
  assert.equal((await as(ids.teacherC, "select * from report.push_status()")).rows.length, 0);
});

test("인물 사진·생년월일: 검토자가 저장, 다른 팀에는 비공개, 일반 교사는 활동 명단 수정 불가", async () => {
  const inserted = await as(ids.admin, "insert into report.members(group_id,name,status) values ($1,'사진 테스트','active') returning id", [ids.youth]);
  const mid = inserted.rows[0].id;
  await as(ids.eduReviewer, "update report.members set photo_data='data:image/jpeg;base64,/9j/2Q==',birth_date='2012-03-04' where id=$1", [mid]);
  const seen = await as(ids.teacherC, "select photo_data,birth_date::text from report.members where id=$1", [mid]);
  assert.equal(seen.rows[0].birth_date, "2012-03-04");
  assert.equal(seen.rows[0].photo_data, "data:image/jpeg;base64,/9j/2Q==");
  assert.equal((await as(ids.techWriter, "select id from report.members where id=$1", [mid])).rows.length,0);
  const changed = await as(ids.teacherC, "update report.members set birth_date='2012-03-05' where id=$1 returning id",[mid]);
  assert.equal(changed.rows.length,0);
  await rejects(as(ids.admin, "update report.members set photo_data='https://public.example.com/person.jpg' where id=$1",[mid]), /check constraint/);
});

test("그룹 삭제: 관리자만 가능하고 하위 그룹과 함께 숨기며 기존 보고·명단은 보존", async () => {
  const gid = (await as(ids.admin, "insert into report.groups(type,name) values ('education','삭제 테스트') returning id")).rows[0].id;
  const child = (await as(ids.admin, "insert into report.groups(type,name,parent_id) values ('education','삭제 하위',$1) returning id",[gid])).rows[0].id;
  await as(ids.admin, "insert into report.members(group_id,name) values ($1,'보존할 학생')",[child]);
  const rid = (await as(ids.admin, "insert into report.reports(group_id,author_id,meeting_date,meeting_label) values ($1,$2,'2026-10-18','보존할 보고') returning id",[child,ids.admin])).rows[0].id;
  await rejects(as(ids.techWriter, "select report.archive_group($1)",[gid]),/관리자/);
  await rejects(as(null, "select report.archive_group($1)",[gid]),/permission denied/);
  await as(ids.admin,"select report.archive_group($1)",[gid]);
  assert.equal((await db.query("select count(*)::int n from report.groups where (id=$1 or id=$2) and is_active",[gid,child])).rows[0].n,0);
  assert.equal((await db.query("select id from report.reports where id=$1",[rid])).rows.length,1);
  assert.equal((await db.query("select id from report.members where group_id=$1",[child])).rows.length,1);
});

test("팀은 12개 독립 보고 그룹이며 라이프라인은 주일, 수요와 월별 금요예배는 별개", async () => {
  const teams = await db.query("select g.name from report.groups g join report.groups p on p.id=g.parent_id where p.name='예배/기술팀' and g.is_active order by g.sort_order");
  assert.deepEqual(teams.rows.map(r=>r.name),['예배팀','음향팀','영상팀','조명팀','자막팀','웰컴팀','성찬위원','성찬 준비팀','새가족팀','새가족케어팀','예배위원','PD']);
  const services = await db.query("select name,weekday,month_week from report.service_types where is_active order by sort_order");
  assert.equal(services.rows.find(r=>r.name==='라이프라인').weekday,0);
  assert.equal(services.rows.find(r=>r.name==='수요예배').weekday,3);
  assert.deepEqual(services.rows.filter(r=>r.weekday===5).map(r=>r.month_week),[1,2,3,-1]);
});

test("학교 보고: 두 학교가 분리되고 송리스트·설교·내용·이슈를 출결 없이 저장한다", async () => {
  const school = await groupId("베리타스 기독초");
  const middle = await groupId("베리타스 기독국제중");
  const writer = await signUp("학교 작성자");
  const reviewer = await signUp("학교 검토자");
  const approveSchool = (user, group, role) => as(ids.admin,"select report.approve_user($1,$2::jsonb)",[user,JSON.stringify([{group_id:group,role}])]);
  await approveSchool(writer,school,"writer");
  await approveSchool(reviewer,school,"reviewer");
  const rid = (await as(writer,"insert into report.reports(group_id,author_id,meeting_date,meeting_label) values ($1,$2,'2026-10-19','학교예배') returning id",[school,writer])).rows[0].id;
  const details = {song_list:"첫 곡\n둘째 곡",sermon_passage:"요한복음 3:16",preacher:"학교 교역자",content:"설교 요약과 교육 활동",notes:"",requests:[]};
  await save(writer,rid,{details,issues:[{category:"진행",content:"예배 시간 조정",status:"open",action:"협의 예정"}]});
  const report = (await as(reviewer,"select details,enrolled_snapshot,attend_snapshot from report.reports where id=$1",[rid])).rows[0];
  assert.deepEqual(report.details,details);
  assert.equal(report.enrolled_snapshot,null);
  assert.equal(report.attend_snapshot,null);
  assert.equal((await db.query("select count(*)::int n from report.attendance where report_id=$1",[rid])).rows[0].n,0);
  assert.equal((await as(reviewer,"select content from report.report_issues where report_id=$1",[rid])).rows[0].content,"예배 시간 조정");
  assert.equal((await as(ids.techWriter,"select id from report.reports where id=$1",[rid])).rows.length,0);
  await rejects(as(writer,"insert into report.reports(group_id,author_id,meeting_date,meeting_label) values ($1,$2,'2026-10-19','학교예배')",[middle,writer]),/row-level security/);
  await save(writer,rid,{details,issues:[]});
  assert.equal((await as(reviewer,"select id from report.report_issues where report_id=$1",[rid])).rows.length,0);
});

test("공지·댓글: 대상 부서만 열람·댓글, 검토자는 담당 부서만 발신, 위조 작성자 거부", async () => {
  const create = (user,target,extra={}) => as(user,"insert into report.notices(author_id,target_type,target_group_id,audience,title,body) values ($1,$2,$3,$4,'이번 주 안내','전체 모임 공지') returning id",[extra.author ?? user,target.type ?? null,target.group ?? null,extra.audience ?? 'all']);
  const nid=(await create(ids.admin,{type:'education'})).rows[0].id;
  assert.equal((await as(ids.teacherC,"select id from report.notices where id=$1",[nid])).rows.length,1);
  assert.equal((await as(ids.eduReviewer,"select id from report.notices where id=$1",[nid])).rows.length,1);
  assert.equal((await as(ids.techWriter,"select id from report.notices where id=$1",[nid])).rows.length,0);
  assert.equal((await as(ids.pending,"select id from report.notices where id=$1",[nid])).rows.length,0);
  await rejects(as(null,"select * from report.notices"),/permission denied/);
  await as(ids.teacherC,"insert into report.notice_comments(notice_id,author_id,body) values ($1,$2,'확인했습니다')",[nid,ids.teacherC]);
  assert.equal((await as(ids.eduReviewer,"select body from report.notice_comments where notice_id=$1",[nid])).rows[0].body,'확인했습니다');
  assert.equal((await as(ids.techWriter,"select id from report.notice_comments where notice_id=$1",[nid])).rows.length,0);
  await rejects(as(ids.techWriter,"insert into report.notice_comments(notice_id,author_id,body) values ($1,$2,'잘못된 댓글')",[nid,ids.techWriter]),/row-level security/);
  await rejects(as(ids.teacherC,"insert into report.notice_comments(notice_id,author_id,body) values ($1,$2,'작성자 위조')",[nid,ids.admin]),/row-level security/);
  await rejects(create(ids.teacherC,{group:ids.youth}),/row-level security/);
  await rejects(create(ids.eduReviewer,{group:ids.sound}),/row-level security/);
  await rejects(create(ids.eduReviewer,{type:'education'}),/row-level security/);
  await rejects(create(ids.eduReviewer,{group:ids.youth},{author:ids.admin}),/row-level security/);
  const privateId=(await create(ids.eduReviewer,{group:ids.youth},{audience:'reviewer'})).rows[0].id;
  assert.equal((await as(ids.teacherC,"select id from report.notices where id=$1",[privateId])).rows.length,0);
  assert.equal((await as(ids.admin,"select id from report.notices where id=$1",[privateId])).rows.length,1);
  assert.equal((await as(ids.techWriter,"select * from report.notice_recipients($1)",[nid])).rows.length,0);
  const targets=(await as(ids.admin,"select * from report.notice_recipients($1)",[nid])).rows.map(r=>r.user_id);
  assert.ok(targets.includes(ids.teacherC));
  assert.ok(!targets.includes(ids.techWriter));
  assert.ok(!targets.includes(ids.pending));
  assert.ok(!targets.includes(ids.admin));
  await as(ids.teacherC,"update report.profiles set notify_enabled=false where id=$1",[ids.teacherC]);
  assert.equal((await as(ids.teacherC,"select id from report.notices where id=$1",[nid])).rows.length,1);
  assert.ok(!(await as(ids.admin,"select * from report.notice_recipients($1)",[nid])).rows.some(r=>r.user_id===ids.teacherC));
  await as(ids.teacherC,"update report.profiles set notify_enabled=true where id=$1",[ids.teacherC]);
});

test("모임 없음: 교육·학교 사유 필수, 미래 주차·기술팀·다른 부서의 작성 거부", async () => {
  const week=(await db.query("select ((now() at time zone 'Asia/Seoul')::date - extract(dow from now() at time zone 'Asia/Seoul')::int)::text w")).rows[0].w;
  const set=(user,group,reason,date=week)=>as(user,"insert into report.week_status(group_id,week,no_meeting,reason,set_by) values ($1,$2,true,$3,$4)",[group,date,reason,user]);
  await rejects(set(ids.admin,ids.youth,''),/사유/);
  await rejects(set(ids.admin,ids.sound,'보고 유동적'),/교육부서와 학교/);
  await rejects(set(ids.techWriter,ids.youth,'다른 부서'),/row-level security/);
  const future=(await db.query("select ($1::date+7)::text w",[week])).rows[0].w;
  await rejects(set(ids.admin,ids.youth,'미래',future),/미래/);
  await set(ids.admin,ids.youth,'연합예배');
  await set(ids.admin,await groupId('베리타스 기독초'),'방학');
  assert.equal((await as(ids.admin,"select reason from report.week_status where group_id=$1 and week=$2",[ids.youth,week])).rows[0].reason,'연합예배');
  await as(ids.admin,"delete from report.week_status where group_id=$1 and week=$2",[ids.youth,week]);
});

test("예배 경위서: 여러 팀의 검토자 공유, 작성자 외 팀원 차단, 변경 권한·후속 조치 검증", async () => {
  const sound=randomUUID(),video=randomUUID(),third=randomUUID();
  for(const [id,name] of [[sound,'경위음향'],[video,'경위영상'],[third,'경위조명']])
    await db.query("insert into report.groups(id,name,type,schedule) values($1,$2,'worship','irregular')",[id,name]);
  const writer=await signUp('경위작성자'),peer=await signUp('경위동료'),reviewer=await signUp('경위검토자'),other=await signUp('다른검토자');
  for(const [user,group,role] of [[writer,sound,'writer'],[peer,sound,'writer'],[reviewer,video,'reviewer'],[other,third,'reviewer']])
    await as(ids.admin,"select report.approve_user($1,$2::jsonb)",[user,JSON.stringify([{group_id:group,role}])]);
  const today=(await db.query("select (now() at time zone 'Asia/Seoul')::date::text d")).rows[0].d;
  const insert=(user,groups=[sound,video],owner=user,date=today,report=null)=>as(user,
    "insert into report.worship_incidents(author_id,group_ids,occurred_on,service_name,title,circumstances,report_id) values($1,$2,$3,'수요예배','마이크 끊김','설교 중 발생',$4) returning id",
    [owner,groups,date,report]);
  const id=(await insert(writer)).rows[0].id;
  for(const user of [writer,reviewer,ids.admin]) assert.equal((await as(user,"select id from report.worship_incidents where id=$1",[id])).rows.length,1);
  for(const user of [peer,other,ids.teacherA,ids.pending]) assert.equal((await as(user,"select id from report.worship_incidents where id=$1",[id])).rows.length,0);
  await rejects(as(null,"select * from report.worship_incidents"),/permission denied/);
  await rejects(insert(other),/row-level security/);
  await rejects(insert(writer,[sound],ids.admin),/row-level security/);
  await rejects(insert(writer,[ids.youth]),/관련 파트/);
  await rejects(insert(writer,[sound,sound]),/관련 파트/);
  await rejects(insert(writer,[],writer),/check constraint|row-level security/);
  const tomorrow=(await db.query("select ($1::date+1)::text d",[today])).rows[0].d;
  await rejects(insert(writer,[sound],writer,tomorrow),/미래/);
  await rejects(as(writer,"update report.worship_incidents set group_ids=$1 where id=$2",[[third],id]),/관련 정보/);
  await rejects(as(writer,"update report.worship_incidents set author_id=$1 where id=$2",[ids.admin,id]),/관련 정보/);
  assert.equal((await as(peer,"update report.worship_incidents set cause='위조' where id=$1 returning id",[id])).rows.length,0);
  await rejects(as(reviewer,"update report.worship_incidents set status='resolved' where id=$1",[id]),/대응 결과/);
  await as(reviewer,"update report.worship_incidents set status='temporary',cause='케이블',response='교체',prevention='사전 점검',follow_up_owner='담당자' where id=$1",[id]);
  await as(writer,"update report.worship_incidents set status='resolved' where id=$1",[id]);
  assert.equal((await as(reviewer,"select status from report.worship_incidents where id=$1",[id])).rows[0].status,'resolved');
  await rejects(as(writer,"delete from report.worship_incidents where id=$1",[id]),/permission denied/);
  await rejects(as(ids.admin,"truncate report.worship_incidents"),/permission denied/);
  await db.query("update report.profiles set status='disabled' where id=$1",[writer]);
  assert.equal((await as(writer,"select id from report.worship_incidents where id=$1",[id])).rows.length,0);
  await rejects(insert(writer),/row-level security/);
});

test("예배 경위서: 주간 보고 연결 시 부서·날짜·예배 일치와 원본 보존", async () => {
  const gid=(await db.query("select id from report.groups where name='경위음향'")).rows[0].id;
  const sid=(await db.query("select id from report.service_types where name='수요예배'")).rows[0].id;
  const today=(await db.query("select (now() at time zone 'Asia/Seoul')::date::text d")).rows[0].d;
  const rid=randomUUID();
  await db.query("insert into report.reports(id,group_id,author_id,meeting_date,service_type_id) values($1,$2,$3,$4,$5)",[rid,gid,ids.admin,today,sid]);
  const add=(date,groups=[gid],service=sid)=>as(ids.admin,"insert into report.worship_incidents(author_id,group_ids,occurred_on,service_id,service_name,title,circumstances,report_id) values($1,$2,$3,$4,'틀린 이름','연결 테스트','경위',$5) returning id,service_name",[ids.admin,groups,date,service,rid]);
  const previous=(await db.query("select ($1::date-1)::text d",[today])).rows[0].d;
  await rejects(add(previous),/일치/);
  await rejects(add(today,[ids.sound]),/일치/);
  await rejects(add(today,[gid],null),/일치/);
  const row=(await add(today)).rows[0];
  assert.equal(row.service_name,'수요예배');
  assert.equal((await db.query("select count(*)::int n from report.reports where id=$1",[rid])).rows[0].n,1);
  await rejects(as(ids.admin,"update report.worship_incidents set report_id=null where id=$1",[row.id]),/관련 정보/);
});

test("팀 이슈 업그레이드: 기존 이슈·경위서 보존, 같은 ID에 상세 추가, 관련 팀 보고에서 같은 상태 조회", async () => {
  const upgrade=new PGlite();
  try {
    await upgrade.exec(SUPABASE_STUB);
    const files=readdirSync(migrationsDir).sort();
    for(const file of files.filter(f=>f<'20261025000000_team_issues.sql')) await upgrade.exec(readFileSync(join(migrationsDir,file),'utf8'));
    await upgrade.exec(readFileSync(join(root,'supabase','seed.sql'),'utf8'));
    const author=randomUUID(),reviewer=randomUUID(),other=randomUUID();
    for(const user of [author,reviewer,other]) {
      await upgrade.query("insert into auth.users(id) values($1)",[user]);
      await upgrade.query("insert into report.profiles(id,status) values($1,'active')",[user]);
    }
    const sound=(await upgrade.query("select id from report.groups where name='음향팀'")).rows[0].id;
    const video=(await upgrade.query("select id from report.groups where name='영상팀'")).rows[0].id;
    const sid=(await upgrade.query("select id from report.service_types where name='수요예배'")).rows[0].id;
    await upgrade.query("insert into report.memberships(user_id,group_id,role) values($1,$2,'writer'),($3,$4,'reviewer')",[author,sound,reviewer,video]);
    const today=(await upgrade.query("select (now() at time zone 'Asia/Seoul')::date::text d")).rows[0].d;
    const report=randomUUID(),legacy=randomUUID(),existing=randomUUID();
    await upgrade.query("insert into report.reports(id,group_id,author_id,meeting_date,service_type_id) values($1,$2,$3,$4,$5)",[report,sound,author,today,sid]);
    await upgrade.query("insert into report.report_issues(id,report_id,category,content,status,action) values($1,$2,'장비','케이블 교체','resolved','교체 완료')",[legacy,report]);
    await upgrade.query("insert into report.worship_incidents(id,author_id,group_ids,occurred_on,service_id,service_name,title,circumstances,response,prevention,status) values($1,$2,$3,$4,$5,'수요예배','공유 이슈','경위','대응','개선','resolved')",[existing,author,[sound,video],today,sid]);
    await upgrade.exec(readFileSync(join(migrationsDir,'20261025000000_team_issues.sql'),'utf8'));
    const migrated=(await upgrade.query("select * from report.worship_incidents where id=$1",[legacy])).rows[0];
    assert.equal(migrated.category,'장비'); assert.equal(migrated.circumstances,'케이블 교체');
    assert.equal(migrated.response,'교체 완료'); assert.equal(migrated.status,'resolved');assert.equal(migrated.detailed,false);
    assert.equal((await upgrade.query("select status from report.worship_incidents where id=$1",[existing])).rows[0].status,'resolved');
    assert.equal((await upgrade.query("select count(*)::int n from report.worship_incidents")).rows[0].n,2);
    assert.equal((await upgrade.query("select content from report.report_issues where id=$1",[legacy])).rows[0].content,'케이블 교체');
    const asUpgrade=(user,sql,args=[])=>upgrade.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);return tx.query(sql,args);});
    await asUpgrade(author,"update report.worship_incidents set detailed=true,prevention='사전 점검' where id=$1",[legacy]);
    assert.equal((await upgrade.query("select count(*)::int n from report.worship_incidents")).rows[0].n,2);
    await rejects(asUpgrade(author,"update report.worship_incidents set detailed=false where id=$1",[legacy]),/되돌릴/);
    await rejects(asUpgrade(author,"update report.report_issues set status='open' where id=$1",[legacy]),/통합된 팀 이슈/);
    const shared=await asUpgrade(reviewer,"select id,status from report.worship_incidents where group_ids @> $1::uuid[] and occurred_on=$2 and service_id=$3",[[video],today,sid]);
    assert.deepEqual(shared.rows,[{id:existing,status:'resolved'}]);
    assert.equal((await asUpgrade(other,"select id from report.worship_incidents")).rows.length,0);
    await asUpgrade(reviewer,"update report.worship_incidents set status='temporary' where id=$1",[existing]);
    assert.equal((await asUpgrade(author,"select status from report.worship_incidents where id=$1",[existing])).rows[0].status,'temporary');
  } finally { await upgrade.close(); }
});

test("일~토 업그레이드: 원본 날짜·보고 ID 보존, 주일과 주중은 같은 주, 미래 날짜 입력 차단",async()=>{
  const upgrade=new PGlite();
  try {
    await upgrade.exec(SUPABASE_STUB);
    for(const f of readdirSync(migrationsDir).sort().filter(f=>f<'20261026000000_sunday_weeks.sql')) await upgrade.exec(readFileSync(join(migrationsDir,f),'utf8'));
    await upgrade.exec(readFileSync(join(root,'supabase','seed.sql'),'utf8'));
    const author=randomUUID();
    await upgrade.query("insert into auth.users(id) values($1)",[author]);
    await upgrade.query("insert into report.profiles(id,status,is_admin) values($1,'active',true)",[author]);
    const group=(await upgrade.query("select id from report.groups where name='초등부'")).rows[0].id;
    const date=(await upgrade.query("select (now() at time zone 'Asia/Seoul')::date::text today,((now() at time zone 'Asia/Seoul')::date-extract(dow from now() at time zone 'Asia/Seoul')::int)::text sunday")).rows[0];
    const reportIds=[];
    for(const offset of [0,3,6,7]) {
      const row=(await upgrade.query("insert into report.reports(group_id,author_id,meeting_date,meeting_label,details) values($1,$2,$3::date+$4::int,'보존','{\"notes\":\"원본\"}') returning id,meeting_date::text d",[group,author,date.sunday,offset])).rows[0];
      reportIds.push(row);
    }
    await upgrade.query("insert into report.week_status(group_id,week,no_meeting,reason,set_by) values($1,$2,true,'주일 표시',$3)",[group,date.sunday,author]);
    await upgrade.exec(readFileSync(join(migrationsDir,'20261026000000_sunday_weeks.sql'),'utf8'));
    for(const [i,row] of reportIds.entries()) {
      const saved=(await upgrade.query("select meeting_date::text d,week::text w,details from report.reports where id=$1",[row.id])).rows[0];
      assert.equal(saved.d,row.d);assert.deepEqual(saved.details,{notes:'원본'});
      assert.equal(saved.w,i===3 ? reportIds[3].d : date.sunday);
    }
    assert.equal((await upgrade.query("select week::text w from report.week_status where group_id=$1",[group])).rows[0].w,date.sunday);
    await assert.rejects(upgrade.query("insert into report.reports(group_id,author_id,meeting_date,meeting_label) values($1,$2,$3::date+1,'미래')",[group,author,date.today]),/미래 날짜/);
    await assert.rejects(upgrade.query("update report.reports set meeting_date=$1::date+1 where id=$2",[date.today,reportIds[0].id]),/미래 날짜/);
    const saved=(await upgrade.query("insert into report.reports(group_id,author_id,meeting_date,meeting_label) values($1,$2,$3,'현재') returning week::text w",[group,author,date.today])).rows[0];
    assert.equal(saved.w,date.sunday);
  } finally { await upgrade.close(); }
});
