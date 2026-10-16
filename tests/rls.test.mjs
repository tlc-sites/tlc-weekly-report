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
  for (const file of readdirSync(migrationsDir).sort()) {
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
  ids.sound = await groupId("음향");

  const approve = (user, assignments) =>
    as(ids.admin, "select report.approve_user($1, $2::jsonb)", [user, JSON.stringify(assignments)]);
  await approve(ids.teacherA, [{ group_id: ids.youth, role: "writer" }]);
  await approve(ids.teacherB, [{ group_id: ids.youth, role: "writer" }]);
  await approve(ids.eduReviewer, [{ group_id: ids.edu, role: "reviewer" }]);
  await approve(ids.techWriter, [{ group_id: ids.sound, role: "writer" }]);
});

test("시드: 중복 없이 그룹 21개(교육부서 8, 예배팀 10, 부산), 예배 5개가 생성된다", async () => {
  const groups = await db.query("select count(*)::int as n from report.groups");
  const services = await db.query("select count(*)::int as n from report.service_types");
  const worshipLinks = await db.query("select count(*)::int as n from report.group_service_types");
  const campus = await db.query("select type from report.groups where name = '부산 캠퍼스'");
  assert.equal(groups.rows[0].n, 21);
  assert.equal(services.rows[0].n, 5);
  assert.equal(worshipLinks.rows[0].n, 50);
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
  assert.equal(groups.rows.length, 21);
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

test("주차는 그 주(월~일)의 일요일로 계산된다", async () => {
  const { rows } = await db.query(`
    select d::date as d, (d::date + ((7 - extract(isodow from d::date)::int) % 7))::text as week
    from unnest(array['2026-10-12', '2026-10-14', '2026-10-16', '2026-10-18', '2026-10-19']) d`);
  assert.deepEqual(rows.map((r) => r.week), ["2026-10-18", "2026-10-18", "2026-10-18", "2026-10-18", "2026-10-25"]);
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
    { name: "음향", role: "writer" },
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
    "insert into report.reports (group_id, author_id, meeting_date, meeting_label) values ($1, $2, '2026-10-25', '주일예배') returning id",
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
    "insert into report.reports (group_id, author_id, meeting_date, meeting_label) values ($1, $2, '2026-11-01', $3) returning id",
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
  assert.deepEqual(newcomer.rows[0], { status: "newcomer", d: "2026-11-01", follow_up_status: "new", present: true });

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

test("보고 저장(예배팀): 이슈는 저장할 때마다 통째로 교체된다", async () => {
  const rid = await newReport(ids.techWriter, ids.sound, "1부 예배");
  await save(ids.techWriter, rid, {
    details: { result: "minor" },
    issues: [
      { category: "장비", content: "무선 마이크 끊김", status: "open", action: "" },
      { category: "인력", content: "인원 부족", status: "resolved", action: "지원 요청" },
    ],
  }, "draft");
  let issues = await db.query("select category, status, resolved_at is not null as resolved from report.report_issues where report_id = $1 order by category", [rid]);
  assert.deepEqual(issues.rows, [
    { category: "인력", status: "resolved", resolved: true },
    { category: "장비", status: "open", resolved: false },
  ]);

  await save(ids.techWriter, rid, { details: { result: "normal" }, issues: [{ category: "진행·큐시트", content: "순서 변경", status: "temporary", action: "" }] });
  issues = await db.query("select category from report.report_issues where report_id = $1", [rid]);
  assert.deepEqual(issues.rows.map((r) => r.category), ["진행·큐시트"]);
});

test("보고 저장: 검토자가 저장해도 작성자의 글은 건드리지 않는다", async () => {
  await save(ids.eduReviewer, ids.eduReport, { details: { sermon_passage: "검토자 수정" }, messages: { pastor: "" } });
  const messages = await db.query("select body from report.report_messages where report_id = $1 and recipient = 'pastor'", [ids.eduReport]);
  assert.equal(messages.rows[0].body, "목사님께 드리는 글");
});
