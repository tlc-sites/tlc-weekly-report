// 운영 DB처럼 1·2차 구조와 기존 데이터가 있는 상태에서 3차 마이그레이션을 적용해 결과를 검증한다.
// 실행: npm run test:db
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { SUPABASE_STUB } from "./stub.mjs";

const dir = join(import.meta.dirname, "..", "supabase", "migrations");
const read = (file) => readFileSync(join(dir, file), "utf8");

// 1차 운영 적용 당시의 시드 (예배 구분, 기술팀 4개 파트, 교육부서 7개)
const LEGACY_SEED = `
  insert into report.service_types (category, name, weekday, sort_order) values
    ('주일', '1부 예배', 0, 1), ('주일', '2부 예배', 0, 2), ('주일', '3부 예배', 0, 3),
    ('라이프라인', '수요예배', 3, 4), ('라이프라인', '금요예배', 5, 5);
  insert into report.groups (type, name, schedule, sort_order) values
    ('education', '교육부', 'irregular', 1), ('tech', '기술팀', 'irregular', 2);
  insert into report.groups (type, name, parent_id, settings, sort_order)
  select 'education', v.name, (select id from report.groups where name = '교육부'), v.settings::jsonb, v.o
  from (values ('영아부', '{"guardian_check": true}', 1), ('유아부', '{"guardian_check": true}', 2), ('유치부', '{}', 3),
               ('유년부', '{}', 4), ('초등부', '{}', 5), ('소년부', '{}', 6), ('중고등부', '{}', 7)) v (name, settings, o);
  insert into report.groups (type, name, parent_id, sort_order)
  select 'tech', v.name, (select id from report.groups where name = '기술팀'), v.o
  from (values ('영상', 1), ('음향', 2), ('사진', 3), ('조명', 4)) v (name, o);
  insert into report.group_service_types (group_id, service_type_id)
  select g.id, s.id from report.groups g join report.groups p on p.id = g.parent_id and p.name = '기술팀'
  cross join report.service_types s;
`;

test("운영 DB 업그레이드: 3차 마이그레이션이 기존 데이터를 새 구조로 바꾼다", async () => {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  await db.exec(read("20261016000000_init.sql"));
  await db.exec(read("20261017000000_admin_tools.sql"));
  await db.exec(LEGACY_SEED);
  // 기존 중고등부 명단은 그대로 중등부로 이어져야 한다
  await db.exec("insert into report.members (group_id, name) select id, '기존학생' from report.groups where name = '중고등부'");

  await db.exec(read("20261018000000_restructure_types.sql"));
  await db.exec(read("20261018000001_restructure.sql"));

  const { rows } = await db.query(`
    select coalesce(p.name || ' > ', '') || g.name as path, g.type::text as type, g.is_active
    from report.groups g left join report.groups p on p.id = g.parent_id
    order by coalesce(p.sort_order, g.sort_order), (g.parent_id is not null), g.sort_order, g.name`);
  assert.deepEqual(
    rows.filter((r) => r.is_active).map((r) => r.path),
    [
      "교육부",
      "교육부 > 영유아부",
      "교육부 > 유치부",
      "교육부 > 유년부",
      "교육부 > 초등부",
      "교육부 > 소년부",
      "교육부 > 영어예배",
      "교육부 > 중등부",
      "교육부 > 고등부",
      "예배팀",
      "예배팀 > 음향",
      "예배팀 > 영상",
      "예배팀 > 조명",
      "예배팀 > 자막",
      "예배팀 > 음원",
      "예배팀 > 웰컴",
      "예배팀 > 성찬",
      "예배팀 > 성찬준비",
      "예배팀 > 새가족",
      "예배팀 > 새가족케어",
      "부산 캠퍼스",
    ],
  );
  assert.deepEqual(rows.filter((r) => !r.is_active).map((r) => r.path).sort(), ["교육부 > 유아부", "예배팀 > 사진"]);
  assert.ok(rows.filter((r) => r.path.startsWith("예배팀")).every((r) => r.type === "worship"));
  assert.equal(rows.find((r) => r.path === "부산 캠퍼스").type, "campus");

  const settings = await db.query("select settings from report.groups where name = '영유아부'");
  assert.deepEqual(settings.rows[0].settings, { guardian_check: true });

  const member = await db.query(
    "select g.name from report.members m join report.groups g on g.id = m.group_id where m.name = '기존학생'",
  );
  assert.equal(member.rows[0].name, "중등부");

  const links = await db.query(`
    select count(*)::int as n from report.group_service_types gs
    join report.groups g on g.id = gs.group_id
    join report.groups p on p.id = g.parent_id and p.name = '예배팀'
    where g.is_active`);
  assert.equal(links.rows[0].n, 50);

  const cols = await db.query(
    "select column_name from information_schema.columns where table_schema = 'report' and table_name = 'service_types'",
  );
  assert.ok(!cols.rows.some((c) => c.column_name === "category"));

  const services = await db.query("select name from report.service_types order by sort_order");
  assert.deepEqual(
    services.rows.map((s) => s.name),
    ["1부 예배", "2부 예배", "3부 예배", "라이프라인 수요예배", "라이프라인 금요예배"],
  );

  // 최신 구조에서도 기존 보고·출석·소속의 ID가 보존되어야 한다.
  const soundBefore = (await db.query("select id from report.groups where name='음향'")).rows[0].id;
  const parentBefore = (await db.query("select id from report.groups where name='예배팀' and parent_id is null")).rows[0].id;
  const user = (await db.query("insert into auth.users(id,email) values (gen_random_uuid(),'upgrade@example.com') returning id")).rows[0].id;
  await db.query("insert into report.profiles(id,email,status,is_admin) values ($1,'upgrade@example.com','active',true)",[user]);
  await db.query("insert into report.memberships(user_id,group_id,role) values ($1,$2,'reviewer')",[user,parentBefore]);
  const legacyService = (await db.query("select id from report.service_types where name='라이프라인 금요예배'")).rows[0].id;
  const reportId = (await db.query("insert into report.reports(group_id,author_id,meeting_date,service_type_id) values ($1,$2,'2026-10-16',$3) returning id",[soundBefore,user,legacyService])).rows[0].id;
  await db.exec(read("20261019000000_save_report.sql"));
  await db.exec(read("20261020000000_push.sql"));
  await db.exec(read("20261021000000_roster_services.sql"));
  assert.equal((await db.query("select name from report.groups where id=$1",[soundBefore])).rows[0].name,'음향팀');
  assert.equal((await db.query("select name from report.groups where id=$1",[parentBefore])).rows[0].name,'예배/기술팀');
  assert.equal((await db.query("select count(*)::int n from report.memberships where user_id=$1 and group_id=$2",[user,parentBefore])).rows[0].n,1);
  assert.equal((await db.query("select service_type_id from report.reports where id=$1",[reportId])).rows[0].service_type_id,legacyService);
  assert.equal((await db.query("select is_active from report.service_types where id=$1",[legacyService])).rows[0].is_active,false);
  assert.equal((await db.query("select count(*)::int n from report.service_types where is_active")).rows[0].n,9);
  assert.equal((await db.query("select count(*)::int n from report.members where name='기존학생'")).rows[0].n,1);
});
