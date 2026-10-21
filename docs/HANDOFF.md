# 작업 인계 문서 (Codex용)

작성일: 2026-10-19 · 기준: master, 5단계(웹 푸시)까지 커밋됨

이 문서만 읽고 이어서 작업할 수 있도록 지금까지의 상태, 구조, 규칙, 남은 일을 정리했다.
세팅 절차는 [SETUP.md](SETUP.md), 저장소 규칙은 루트의 `AGENTS.md`를 함께 본다.

---

## 1. 무엇을 만드는가

교회의 각 모임(교육부서, 예배팀, 부산 캠퍼스 등)이 **매주 보고**를 올리고, 검토자가 확인하고,
**화요일 교역자 회의**에서 모아 보는 웹앱. 휴대폰 사용이 대부분이다.

- 보고 마감: 매주 **월요일 23:59** (지난주 월~일 분)
- 주차 표기: 월~일을 한 주로 보고, **그 주 일요일 날짜**(`YYYY-MM-DD`, 한국 날짜)로 저장
- 사용자 대부분은 교사·팀원(작성자), 일부 부장·팀장(검토자), 관리자, 담임목사님·사모님(받는 분)

## 2. 진행 상황

| 단계 | 내용 | 상태 |
|---|---|---|
| 1~3 | 이메일 OTP 로그인, 가입 신청·승인, 그룹/예배/사용자 관리, 보고 작성(교육·예배팀·기타·캠퍼스 양식), 명단·출석·보호자 | 커밋 `3b5ae2e` |
| 4 | 검토(확인) 처리, 코멘트, 교역자 회의 자료 화면과 인쇄 | 커밋 `987f7d7` |
| 5 | 웹 푸시 알림(구독, 미제출 알림 크론, 관리자 알림 미설정 현황, PWA 매니페스트·아이콘) | 코드 커밋됨(2026-10-19). 운영 DB 6번 마이그레이션은 2026-10-19 적용·검증 완료; Vercel 배포와 실기기 수신은 미확인 |

### 2026-10-19 확인 결과 (현재 작업 트리에서 재검증 완료)

- `npm run test:db` → **42개 전부 통과**
- `npx eslint` → 경고·오류 없음
- `npx tsc --noEmit` → 오류 없음
- `npx next build` → 성공 (페이지 21개, `/api/cron/[slot]` 포함)
- **운영 DB 확인 (2026-10-19)**: `mcbbhsvvzqvtrxlbdcks`에서 `report` 핵심 객체와 `save_report`가 존재하고, 6번 적용 전 푸시 함수 두 개는 없었다. 사용자 승인 후 `20261020000000_push.sql`을 적용했다. `save_push_subscription`과 `push_status` 생성, `SECURITY DEFINER`, 빈 `search_path`, `anon` 실행 거부 및 `authenticated` 실행 허용을 확인했다. 적용 이력 테이블은 없어 실제 객체로 판별했다.
- **확인 못 함**: Vercel 배포 여부와 환경변수, 실제 기기에서 푸시 수신 여부. GitHub 원격 저장소는 `https://github.com/tlc-sites/tlc-weekly-report.git`으로 연결했다.

## 3. 5단계 변경 목록

새 파일
- `supabase/migrations/20261020000000_push.sql` — `save_push_subscription`(같은 기기는 마지막 로그인한 사람의 것으로 교체), `push_status`(관리자용 기기 수)
- `src/lib/push.ts` — `web-push` 발송. 404/410이면 구독 삭제, 성공하면 `last_success_at` 갱신
- `src/lib/reminder-targets.ts` — 알림 대상 계산(순수 함수, 다른 모듈을 import하지 않음 → `node --test`로 직접 검증)
- `src/lib/reminders.ts` — DB 조회 + 대상 계산 + 중복 방지 기록 + 발송
- `src/lib/supabase/admin.ts` — service role 클라이언트 (**서버 전용**, RLS를 거치지 않음)
- `src/app/api/cron/[slot]/route.ts` — 크론 엔드포인트. `Authorization: Bearer $CRON_SECRET` 검사, `?dryRun=1`이면 발송 없이 대상만 반환
- `src/app/settings/` — 알림 설정 화면(기기별 켜기/끄기, 테스트 알림, 알림 수신 여부)
- `src/components/push-banner.tsx` — 홈 화면의 "알림을 켜 주세요" 안내
- `src/app/manifest.ts`, `public/sw.js`, `public/icons/*`, `scripts/generate-icons.mjs`
- `vercel.json` — 크론 3개
- `tests/reminders.test.mjs`

수정한 파일
- `src/proxy.ts` — matcher에서 `sw.js`, `manifest.webmanifest`, `api/cron` 제외
- `src/app/layout.tsx` — `appleWebApp`, 아이콘, `themeColor`
- `src/app/page.tsx` — 푸시 배너, 알림 설정 링크
- `src/app/admin/users/page.tsx` — "알림 미설정 N명" 카드
- `next.config.ts` — 보안 헤더, `sw.js` 캐시 금지와 CSP
- `package.json` — `web-push`, `@types/web-push` 추가, `test:db`에 reminders 테스트 추가
- `.env.example` — VAPID, `SUPABASE_SECRET_KEY`, `CRON_SECRET`
- `tests/rls.test.mjs` — 푸시 구독·알림 현황 권한 테스트 2개

### 알림 규칙

| 크론 (`vercel.json`, UTC) | 한국 시간 | 슬롯 | 받는 사람 |
|---|---|---|---|
| `0 0 * * 1` | 월 09:00 | `mon-am` | 미제출 그룹에 소속된 작성자·검토자 ("지난주 보고가 아직 없어요") |
| `0 11 * * 1` | 월 20:00 | `mon-pm` | 위와 같음("오늘 밤 마감이에요") + 관리자에게 미제출 요약 |
| `0 23 * * 1` | 화 08:00 | `tue-digest` | 검토자 역할이 하나라도 있는 사람 + 관리자 ("회의 자료가 준비됐어요") |

- 대상 주차: `lastCompletedWeek(todayKST())`, 즉 가장 최근에 끝난 월~일
- 미제출 그룹: 활성 + `schedule = 'weekly'` + 하위 그룹이 없는 그룹 중 제출(submitted/reviewed) 보고도 없고 "모임 없음" 표시도 없는 곳. 임시저장(draft)만 있으면 미제출로 본다
- 받는 조건: `profiles.status = 'active'` 그리고 `notify_enabled = true`
- 중복 방지: 보내기 전에 `notification_logs (user_id, week, slot)`에 먼저 upsert하고, 이미 있으면 건너뜀. slot은 `mon-pm:reminder`, `mon-pm:admin`처럼 알림 종류별로 나눈다
- 아이폰은 홈 화면에 추가한 앱에서만 푸시를 받는다. 카카오톡 인앱 브라우저는 따로 안내한다(`push-manager.tsx`)

## 4. 기술 스택과 주의점

- **Next.js 16.4** (App Router, React 19.3), Tailwind 4, zod 4, `@supabase/ssr`, Vercel
- `AGENTS.md`에 적혀 있듯 **학습 데이터의 Next.js와 다르다.** 코드를 쓰기 전에 `node_modules/next/dist/docs/`를 확인한다. 이 프로젝트에서 실제로 쓰는 것:
  - 미들웨어 대신 `src/proxy.ts`의 `proxy()` 함수
  - `next.config.ts`의 `cacheComponents: true` → 페이지는 `<Suspense>`로 감싼 async 컴포넌트에서 데이터를 읽는다(기존 페이지 패턴을 따른다)
  - 전역 타입 `PageProps<"/path">`, `LayoutProps<"/">`, `RouteContext<"/api/...">`
  - 서버 액션 후 갱신은 `next/cache`의 `refresh()`
- **Supabase는 셀케어(tlc-cellcare) 프로젝트를 함께 쓴다.** 모든 객체는 `report` 스키마에 두고, `public` 스키마와 `auth` 트리거는 **절대 건드리지 않는다.** 클라이언트는 `db: { schema: "report" }`로 만든다
- 로그인할 수 있는 사람은 셀케어 교인 명단(`public.profiles`)에 이메일이 있는 사람뿐. 보고 앱 권한은 `report.profiles`에서 따로 관리한다(가입 신청 → 관리자 승인)

## 5. 디렉터리 구조

```
src/
  proxy.ts                    세션 갱신 (matcher 주의)
  app/
    login/ onboarding/ pending/   로그인 → 가입 신청 → 승인 대기
    page.tsx                  홈 (내 그룹, 관리자 메뉴)
    admin/{groups,services,users}  관리자 화면
    groups/[id]/              그룹 보고 목록, 새 보고 / members/ 명단·보호자
    reports/[id]/             보고 작성·열람 (education|worship|campus 양식, review.tsx 검토)
    meeting/                  교역자 회의 자료 + 인쇄
    settings/                 알림 설정 (5단계)
    api/cron/[slot]/          알림 크론 (5단계)
    auth/{callback,signout}/
  lib/
    auth.ts                   requireActive / requireAdmin
    access.ts groups.ts members.ts services.ts meeting.ts
    report-forms.ts           보고 양식 zod 스키마 (브라우저·서버 공용)
    week.ts                   한국 날짜·주차 계산
    push.ts reminders.ts reminder-targets.ts
    supabase/{client,server,proxy,env,admin}.ts
  components/ ui.tsx admin-nav.tsx signout-button.tsx push-banner.tsx
supabase/migrations/          아래 6절 순서
supabase/seed.sql             예배 5개, 교육부 8개, 예배팀 10개, 부산 캠퍼스, app_settings
tests/                        PGlite로 실제 Postgres에서 RLS 검증 (stub.mjs가 Supabase 역할·auth 흉내)
```

## 6. DB

### 마이그레이션 (파일명 순서대로 적용)

1. `20261016000000_init.sql` — 스키마, 테이블, enum, RLS, 권한 함수, 승인 RPC (`push_subscriptions`, `notification_logs` 테이블도 여기서 만든다)
2. `20261017000000_admin_tools.sql` — 그룹 2단계 계층 검사, `set_memberships`, `set_user_admin`
3. `20261018000000_restructure_types.sql` — enum 변경(`tech`→`worship`, `campus` 추가). enum 추가값은 같은 트랜잭션에서 못 쓰므로 **반드시 따로 실행**
4. `20261018000001_restructure.sql` — 조직 재구성, 부산 캠퍼스, 담임목사님·사모님께 드리는 글(`report_messages`), `locale`
5. `20261019000000_save_report.sql` — `save_report` RPC (출석·새친구·기도제목·이슈·글을 한 트랜잭션으로 저장, security invoker)
6. `20261020000000_push.sql` — 5단계 웹 푸시

새 DB에는 위 1~6을 모두 적용한 뒤 `seed.sql`을 실행한다. seed가 `worship`, `campus` 유형을 쓰므로 3번 이후에 실행해야 한다.
`SETUP.md`에도 위 마이그레이션 순서와 seed 실행 절차를 반영했다.

### 핵심 개념

- 그룹: `type` = `education | worship | other | campus`, 상위 그룹 아래 하위 그룹의 **2단계까지만**. 하위 그룹은 상위와 유형이 같아야 함. 보고는 하위 그룹(리프)에서만 쓴다. 삭제하지 않고 `is_active = false`로 보존
- 소속: `memberships(user_id, group_id, role)`, role = `writer | reviewer`. 상위 그룹의 검토자는 하위 그룹도 본다
- 보고 상태: `draft`(임시저장) → `submitted`(제출) → `reviewed`(확인됨). 확인되면 작성자는 더 이상 수정할 수 없고, 작성자는 스스로 확인할 수 없다
- `profiles.status` = `pending | active | disabled`, `is_admin`, `recipient_role` = `pastor | pastor_wife`(각 1명, 관리자가 지정)
- `week_status.no_meeting` — 그 주 모임 없음 표시

### 권한 원칙 (테스트로 고정돼 있음, 바꾸지 말 것)

- 권한은 **모두 RLS로 강제**한다. 앱의 권한 확인(`lib/access.ts`)은 화면 분기용일 뿐이다
- 기도제목: 작성자 본인과 검토자만
- 담임목사님·사모님께 드리는 글: 작성자와 해당 받는 분만 (**관리자·검토자도 못 봄**)
- 보호자 연락처: 교사는 입력만, 열람은 검토자만. 동의 없는 연락처가 있으면 저장 전체 취소
- `notification_logs`: 일반 사용자는 읽기·쓰기 불가 (service role 전용)
- security definer 함수는 `set search_path = ''`, `anon`/`public` 실행 권한 회수

## 7. 환경변수 (`.env.example`)

| 이름 | 용도 | 비고 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase 연결 | |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | 웹 푸시 | `npx web-push generate-vapid-keys` |
| `SUPABASE_SECRET_KEY` | 크론의 관리자 클라이언트 | **서버 전용, `NEXT_PUBLIC_` 금지** |
| `CRON_SECRET` | 크론 인증 | Vercel Cron이 Bearer로 보냄 |

`.env.local`에 실제 값이 있으므로 **커밋하거나 출력하지 않는다**(`.gitignore`에 포함).

## 8. 명령

```
npm install
npm run dev          # http://localhost:3000
npm run test:db      # rls + upgrade + reminders (PGlite, 외부 DB 불필요)
npx eslint
npx tsc --noEmit
npm run build
node scripts/generate-icons.mjs   # 아이콘 다시 만들 때 (sharp는 next 의존성으로 설치돼 있음)
```

크론 수동 점검(발송 없음):
```
curl -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/mon-am?dryRun=1"
```

## 9. 남은 일 / 확인 필요

1. **SETUP.md 갱신 완료** — 마이그레이션 1~6 순서(3번 별도 실행), seed 마지막, 푸시 설정과 Vercel 환경변수·크론 점검 절차 반영
2. **운영 DB 후속 확인** — 6번 마이그레이션 적용과 함수 권한은 확인 완료. Vercel 배포·환경변수와 실기기 푸시 수신을 확인한다. `tests/upgrade.test.mjs`는 1·2차가 적용된 운영 DB에 3차를 올리는 상황을 검증한다
3. **Vercel 크론** — 플랜에 따라 실행 시각 정밀도나 개수 제한이 있을 수 있다. 배포 후 Vercel 대시보드에서 크론 등록과 실행 시각 확인. 현재 시각은 `vercel.json`에 하드코딩돼 있고 `app_settings`의 `deadline`/`reminders` 값은 **코드에서 읽지 않는다**(`long_absence_threshold`만 `lib/meeting.ts`에서 사용)
4. **실기기 테스트** — 안드로이드 Chrome, 아이폰 홈 화면 앱, 카카오톡 인앱 안내
5. `profiles.locale`(ko/en) 컬럼과 권한은 있으나 화면 다국어 처리는 아직 없음
6. GitHub 원격 저장소 연결 완료: `https://github.com/tlc-sites/tlc-weekly-report` (코드 업로드 후 Vercel 연결 필요)

## 10. 작업 규칙 (사용자 지침)

- 사용자와의 대화는 **한국어**로. 코드·명령·경로·에러 원문은 그대로
- 실행해서 확인할 수 있는 것은 직접 실행하고 보고. 확인한 것과 못 한 것을 구분하고, 실패는 실제 출력과 함께 알림
- **삭제, 기존 파일 덮어쓰기, 배포, 강제 푸시, DB 변경**은 실행 전에 설명하고 승인받기. 승인은 그 작업에만 적용
- 코드 스타일: 기존 코드처럼 한국어 주석은 "왜"를 짧게, UI 문구는 존댓말의 쉬운 표현. DB 변경은 새 마이그레이션 파일로 추가하고 `tests/rls.test.mjs`에 권한 테스트를 함께 넣는다


## 26. DB 변경 제외 기능 배포 (2026-10-20, 검증 중)

- 사용자가 운영 DB 권한 변경과 관리자+교역자 설정을 제외한 나머지 배포를 요청했다. 운영 DB 12번에 맞춰 현재 운영 커밋 9be2bb7에서 release/non-db-report-updates와 .deploy-worktree 작업 트리를 분리했다. 미승인 13/14번 migration과 권한 코드는 이 배포에 포함하지 않는다.
- 작성자 이름 필수, 담당 파트, 같은 예배의 복수 보고, 작성자/최종 수정자 기록, 회의 자료 사역 종합 요약 및 이번 주 해결·경미한 이슈 포함을 반영한다. 기존 details._report_meta에 이름/파트/최종 수정 계정을 저장하므로 새 DB 컬럼이나 정책이 필요하지 않다. 저장 액션은 저장된 최초 작성자 기록을 보존하며 클라이언트의 위조 메타데이터는 사용하지 않는다. 기존 보고는 프로필 이름으로 표시한다.
- 열람/검토/공지 수신 역할은 운영의 기존 권한을 유지한다. 신규 담당 파트 제한, 공개/취소, 직책별 공지 수신, 목회 피드백 역할 제한과 계정 배정은 보류한다. 기존 DB 정책 자체의 원작성자 메타데이터 보호는 강화하지 않았다.
- 변경: groups/[id]/actions·page, reports/[id]/actions·page, meeting/page, components/meeting-summary, lib/report-identity, package.json, tests/report-identity.test.mjs. JSON 내용을 직접 수정할 수 있는 기존 DB 권한의 한계와 서버 저장 시의 보호를 구분한다.
- 테스트 61개 통과, lint 통과. 분리 작업 트리의 node_modules junction이 Turbopack 파일시스템 경계 밖이라 기본 build가 Next 패키지를 찾지 못했다. 로컬은 webpack 빌드로 검증하고, 배포 환경에서는 기본 Turbopack 빌드/Ready를 확인할 예정이다.
- 운영 DB 적용/계정 역할 변경/테스트 보고 작성/실제 알림 발송은 하지 않는다. 두 분의 이메일과 사용자 담당 파트는 나중에 받는다.
- 향후 권한 개편을 합칠 때 details._report_meta의 이름·담당 파트를 신규 전용 컬럼으로 보존 이관해야 한다. 별도 작업의 로컬 master 10af8dd는 원격에 푸시하지 않는다. 이 분리 브랜치는 운영 master의 자식이므로 강제 푸시 없이 배포한다.

## 27. 사역 보고 추가 기능 통합 (2026-10-20, 운영 미반영)

- 사용자 답변: 같은 직급끼리 다른 파트 열람, 스데반 인턴십 별도 분류, 회의·공과는 파트별 보고 종류로 확정했다.
- 작업 위치: .deploy-worktree, feature/ministry-reporting-round-two. 운영 a480e73 기반 기능과 로컬 역할 개편 10af8dd를 통합했다. 요청 13개와 상세 권한/운영 순서는 docs/REPORTING_ROUND_TWO.md에 기록했다.
- 주요 변경: 이동 버튼, 인턴십/회의/공과 양식, 말씀·예배위원, 사람별 보고, 보호자 연락처 카드, 리허설 기록·정렬, 수요예배 연결, 예배별 이슈, 본인 팀 이슈 제한, 동급 일반 내용 열람, 등록신청 푸시 큐. 관련 app/components/lib, migration 13~15, 권한·보존·알림 테스트와 문서 변경.
- 동급은 작성 당시 직급 기준이며 수정·검토 권한은 늘리지 않는다. 기도·비공개 글·명단·보호자 연락처에는 동급 열람을 적용하지 않는다. 기존 JSON 작성자·담당 파트·원본 시각 보존을 검증했다.
- 이번 검증: npm.cmd run test:db 80개 통과, npm.cmd run lint 통과, npx.cmd tsc --noEmit 통과, npm.cmd run build -- --webpack 성공. 실제 새 계정별 화면과 실제 등록신청 푸시는 미확인. 기존 Node 모듈 형식 경고가 남는다.
- 운영은 a480e73 / DB12 그대로다. 푸시·테스트 보고 생성·계정 배정·DB 적용·푸시/배포를 하지 않았다. 새 앱은 별도 운영 승인 후 DB13→14→15 적용과 권한 검증을 거쳐 배포한다. 최상단 이메일·본인 담당 파트는 나중에 받기로 했다. 루트의 다른 도구 설정/outputs 변경을 보존했다.

## 28. 사역 보고 기능 운영 배포 완료 (2026-10-21)

- 사용자에게 report 스키마의 DB13~15 변경(직급별 열람·코멘트, 리허설, 등록신청 알림)을 구체적으로 설명했고, 사용자가 「운영 DB 13~15 적용과 앱 배포 승인」으로 별도 승인했다. 계정 직급·담당 파트 배정은 이번 작업에서 제외했다.
- 운영 Supabase PostgreSQL 17.11에서 DB13→14→15를 한 BEGIN/COMMIT으로 적용했다. 기존 report 스키마 모든 테이블의 원본 행을 임시 테이블에 보관하고, 원래 존재한 모든 컬럼의 JSON이 적용 후 정확히 일치하지 않으면 RAISE로 취소하도록 검사했다. 결과 migration13_14_15_applied_originals_preserved, 보고 7건·명단 5명 보존. 임시 테이블은 커밋 시 삭제되며 개인정보는 출력·파일 저장하지 않았다. public/auth 변경 없음.
- 운영 사후 검사: reports/rehearsals/rehearsal_attendance/registration_alerts/private_shares/incident_shares RLS 활성, 빈 작성자 0, 인턴십 분류 1, 수요예배 연결 26. 최상단 0·교역자 0으로 계정 배정은 여전히 대기다.
- 이번 실행 검증: npm.cmd run test:db 80개 성공, npm.cmd run lint 성공, npm.cmd run build -- --webpack 성공, npx.cmd tsc --noEmit 성공. 기존 Node 모듈 형식 경고가 남는다.
- e3fcad9를 원격 master에 일반 푸시했다. Vercel D7wQTbirLDa6XQZEe2hvK1JhZXR6 Production/Current/Ready, 빌드 31초, source e3fcad9 확인. 운영 https://tlc-weekly-report.vercel.app/ 로그인 홈과 새 사람별 보고 목록·홈 이동을 확인했다. 현재 로그인 계정은 기능 관리자만 있고 소속이 없어 열람 가능 보고 0건으로 제한됨을 확인했다. 임의로 승격하지 않았다.
- 미확인/남은 일: 최상단 로그인 이메일과 사용자 담당 파트 수령 후 역할·담당 배정. 각 역할의 실제 화면 및 실기기 등록신청 푸시는 아직 미검증이며 테스트 보고/신청/실제 알림은 생성하지 않았다.
- 증빙: outputs/deploy_20261021/vercel-ready.png. computer-use 스킬로 브라우저 운영 적용/배포 결과 확인. 배포 코드 트리는 .deploy-worktree의 feature/ministry-reporting-round-two이며 루트 master는 10af8dd에 남아 있다. 루트 master를 그대로 푸시하지 말 것. 기존 다른 도구의 설정·문서·outputs 변경을 보존했다.

## 29. 수요예배 제출 문의 읽기 점검 (2026-10-21)

- 사용자 요청으로 특정 보고자의 수요예배 제출 상태를 점검했다. 사용자 설명은 오류 코드 없이 제출이 안 된다는 것이었다.
- computer-use로 운영 SQL 편집기에서 해당 계정의 상태·소속·보고 메타데이터만 조회했다. 이메일·연락처·보고 본문·비공개 글은 조회/출력하지 않았다.
- 결과: 계정 active, 배정 파트 writer 권한 존재. 해당 음향팀 수요예배(2026-10-21) 보고 1건은 submitted이며 마지막 저장 시각은 2026-10-21 11:00:57 KST이다. 진행 결과도 저장되어 있다. 현재 서버에서 제출 실패 상태는 확인되지 않았다.
- 원인 미확정: 현장에서 누른 시점의 화면/오류가 없으므로 완료 표시 지연 또는 다른 화면 문제인지는 확인할 수 없다. 새로고침 후 제출 상태 재확인을 안내한다. 미지정 교역자 직급은 별도 배정 과제이며 이번 제출 실패의 원인으로 단정하지 않는다.
- 코드·DB·권한·배포 변경, 타인 보고 대신 제출, 실제 알림 발송은 하지 않았다. 이번 검증은 운영 읽기 조회와 관련 저장 경로 코드 확인이며 테스트/빌드를 다시 실행한 것으로 표현하지 않는다. 루트의 새 cell-care/ 및 기존 다른 도구 변경도 보존했다.

## 31. 셀케어 흐름에 맞춘 홈·제출현황 정리 (2026-10-21, 로컬 변경)

- 사용자 요청: 보기 어려워진 제출현황과 필요한 메뉴를 정리하고 셀케어와 함께 사용할 부분을 확인한다.
- 비교: cell-care/index.html의 교역자 홈·전체 현황을 읽기 전용으로 확인했다. 두 앱의 남색/회청색·IBM Plex Sans KR/Gowun Batang·카드 기본 형태는 이미 일치한다. 셀케어의 주차 선택→현황 숫자→확인할 보고→담당 목록 흐름을 보고 앱에 적용했다. 셀케어 코드/DB/임시 예외 변경은 건드리지 않았다.
- 변경 파일: .deploy-worktree/src/app/page.tsx, src/app/reports/page.tsx, 신규 src/components/home-overview.tsx와 report-status.tsx. 홈 상단 주차 이동·제출 완료/작성 중/확인 대기 숫자 및 상태별 목록 연결, 내 임시저장 이어 쓰기, 파트별 제출/작성 중 건수, 주차를 유지하는 보고 작성 메뉴, 회의·이슈·셀케어 바로가기, 관리/내 소속 접기 반영. 보고 목록에 상태·작성자·정렬 필터와 제출 시각 표시, 주차 이동 시 필터 유지.
- 집계: 제출 완료는 확인 완료를 포함하고 확인 대기는 그중 submitted만이다. 같은 파트의 제출 보고와 남은 초안을 함께 표시한다. 기술팀은 보고 없음으로만 표시하며 미제출로 집계하지 않는다. 주간 파트의 작성 전/마감 후 미제출과 모임 없음은 별도로 표시한다. 데이터 조회 실패를 미제출로 표시하지 않는다.
- 기존 로그인 사용자의 RLS 범위만 조회한다. 기능 관리자 단독의 내용 열람 제한과 계정 배정 대기는 그대로이며, 셀케어 링크는 새 탭 이동만 제공한다. 두 앱의 개인정보·권한·집계를 합치지 않는다. 최상단은 파트별, 배정 구성원은 담당 파트 기준이다.
- 운영 반영: 소스 로컬 변경만 수행했으며 DB 변경·역할 배정·배포·푸시 없음. 실제 계정별 새 홈 화면 및 모바일 화면은 아직 미검증이다. 운영은 e3fcad9 / DB15 유지. 문서 30절과 루트/셀케어의 다른 작업 변경을 보존했다.

- 31절 이번 최종 검증: npm.cmd run lint 경고·오류 없음, npm.cmd run build -- --webpack 성공(28개 경로), npx.cmd tsc --noEmit 성공, git diff --check 통과. DB/알림/권한 로직 변경이 없어 test:db는 이번 작업에서 재실행하지 않았다.

## 32. 홈·제출현황 운영 배포 (2026-10-21)

- 사용자의 이번 배포 승인에 따라 31절 화면 변경을 커밋 3a282a5로 원격 master에 일반 푸시했다. 다른 셀케어 변경과 DB/권한/계정 배정은 반영하지 않았다.
- Vercel FVJLJasKHrUKPtttfkZELrY5YRxE, source 3a282a5, Production Ready, 배포 소요 18초를 확인했다. 운영 도메인에서 신규 이번 주 제출현황/상태별 건수/셀케어 링크/담당 미배정 안내/접힌 관리·소속 메뉴를 확인했다.
- 실제 브라우저에서 작성 중 숫자→보고 목록(status=draft 선택), 지난 주 이동(2026-10-11) 후 상태 필터 유지와 다음 주/이번 주 링크를 확인했다. 현재 로그인 계정은 담당 미배정 기능 관리자이므로 보고 0건이 정상이다. 각 역할별 유자료 현황/제출 시각과 모바일 화면은 아직 미확인이다. 테스트 보고/신청/알림은 생성하지 않았다.
- 이번 검증: git diff --check, 배포 전 변경 범위 확인, Vercel 운영 빌드 성공과 위 브라우저 확인. lint·타입 검사·로컬 webpack build는 31절 직전 작업에서 수행한 결과이며 이번 배포 턴에 다시 실행하지 않았다. DB15 그대로 유지.
- 증빙: outputs/deploy_20261021/submission-dashboard-ready.png. 배포 코드는 .deploy-worktree/feature/ministry-reporting-round-two의 3a282a5이며 루트 master 10af8dd를 그대로 푸시하지 말 것. 루트/셀케어의 다른 도구 작업과 문서 기록을 보존했다.

## 33. 소속 저장 오류·보고 미열람 원인 점검 (2026-10-21, 수정 로컬)

- 사용자 요청: 보고 앱의 셀케어 링크 제거, 다른 작성자 보고 미표시 및 본인 소속 저장의 일반 오류 점검.
- 운영 읽기 재확인: 활성 관리자 1명, 교역자 false, 담당 소속 0, 최상단 0. 대상 음향팀 수요예배(2026-10-21) 보고는 여전히 submitted. 개인정보·보고 본문은 조회하지 않았다.
- 원인: DB13의 protect_own_memberships가 비최상단 관리자의 자기 소속 변경을 cannot change own content assignments(42501)로 차단한다. UI는 자기 소속 저장을 허용하고 모든 실패를 잠시 후 재시도로 표시했다. 보고 미열람은 기능 관리자 단독/담당 미배정 정책에 따른 것이며, 작성자의 제출 장애와 같다고 단정할 근거는 없다.
- 로컬 수정 파일: src/app/page.tsx 셀케어 링크 제거; src/app/admin/users/actions.ts 자기 변경 사전 차단 및 권한 오류별 구체 안내; src/app/admin/users/[id]/page.tsx 자기 배정 선택 비활성·저장 버튼 숨김·역할 배지·담당 미배정 설명 및 잘못된 전체 열람 설명 수정. 기존 RLS/자가 승격 방지 정책은 변경하지 않았다.
- 이번 검증: lint 성공, webpack build 성공, tsc --noEmit 성공, 역할·담당 권한 테스트 13개 및 최신15번 포함 회귀 6개 총19개 성공, git diff --check 통과. 기존 Node 모듈 형식 경고 남음. 수정 화면 실브라우저 검증은 미실행.
- 운영 미반영: DB·소속·역할·보고 내용 변경/앱 배포 없음. 운영은 3a282a5 / DB15 유지. 사용자 본인에게 관리자+교역자 및 음향팀 reviewer 담당 배정(담당 비공개 열람·수정·확인 포함)을 하면 현재 보고 미열람을 해소할 수 있으나 별도 운영 승인과 정확한 담당 파트 확인이 필요하다. 최상단 계정은 임의 지정하지 않는다. UI 수정 배포도 이번 요청에서 별도 승인받은 뒤 진행한다.
- 루트/셀케어의 다른 작업과 기존 문서 변경은 보존했다.

## 34. 관리자 현황·2주 임시 일반 열람·제출 성공 팝업 (2026-10-21, 로컬 구현)

- 사용자 정정: 관리자는 내용 권한과 별도로 제출현황을 계속 알아야 하고, 셋업 1~2주 동안 일반 내용 열람이 필요하다. 최신 범위에 따라 영구 교역자+음향팀 배정 대신 관리자 현황 RPC와 개별 기간 grant를 구현했다. 제출 성공 시 「제출이 완료되었습니다!」 팝업 요청도 반영했다.
- 신규 16번 migration 20261030000000_admin_submission_setup.sql: 관리자 전용 admin_submission_status(date)는 파트·작성자·예배·날짜·상태·제출시각/can_open만 반환한다. 본문·비공개·기도·명단·연락처·모임 없음 사유 제외. setup_access_grants는 최대14일 CHECK, 클라이언트는 자기 grant 조회만 가능하며 등록/연장은 금지한다. has_setup_access는 활성 관리자+지정 계정+시각을 매 요청 검사하고 일반 보고/이슈 SELECT와 조회 helper만 추가한다. 수정·확인·개인정보·공유·자가 소속 변경 정책은 유지. 원본 보고 변경 및 public/auth 객체 변경 없음.
- 임시 권한은 자동 시드하지 않는다. 운영 제안은 사용자 본인 관리자 계정 한 개에 승인 시점부터 2026-11-04 00:00 KST까지이며, 정확한 계정을 확인한 뒤 별도 운영 승인으로 등록한다. 만료/관리자 해제/계정 비활성 후 내용은 다시 닫히고 관리자 현황 조회만 유지한다.
- 앱 변경: lib/admin-submissions, admin/submissions/page, home-overview와 홈 및 admin-nav에 전체현황 연결. 현재 소속 없어도 현황은 표시. can_open=false인 항목에는 본문 링크 없음. 33절 링크 제거·자기 배정 오류 안내도 유지한다. 관리자 상세의 기존 전체 일반 보고 열람 설명을 실제 담당/동급/공유 기준으로 수정했다.
- 제출 팝업: components/submission-receipt와 reports/[id]/page. 저장 액션 성공의 saved=submit에 더해 실제 보고 상태가 draft가 아니고 canEdit인 경우만 dialog를 연다. 임시저장/실패는 제외. 확인/Escape로 닫으면 saved URL을 제거해 새로고침 때 재표시하지 않는다. 기존 성공 안내문도 유지한다.
- 신규 tests/admin-submissions.test.mjs: 현황만 반환/권한 없는 RPC 차단, 특정 관리자 임시 보고·이슈 읽기, 다른 관리자 미허용, 기도/메시지/명단/보호자 차단, 수정/확인/자가연장 차단, 14일 초과/시작전/만료/관리자해제 차단, 원본 보존 검증. package.json test:db에 포함.
- 이번 최종 검증: npm.cmd run test:db 81개 모두 통과, lint 경고/오류 없음, webpack build 성공(29경로), tsc --noEmit 성공, git diff --check 통과. 중간 테스트 fixture의 존재하지 않는 report_messages.author_id를 제거 후 재실행했다. 기존 Node 모듈 형식 경고 남음. 실제 새 화면·팝업/모바일 동작은 아직 미검증.
- 운영은 3a282a5 / DB15 유지. 운영 DB16 적용·임시 grant·역할 배정·배포·실제 제출/알림은 하지 않았다. docs/ADMIN_SETUP_ACCESS.md에 구체 범위·만료·운영 순서를 정리했다. 이 운영 DB 권한 변경과 UI 배포는 별도 승인 후 진행한다. 다른 셀케어/루트 수정은 보존했다.

## 35. 관리자 현황·임시 일반 열람·팝업 운영 반영 (2026-10-21)

- 사용자가 34절의 구체 범위에 대해 배포를 요청해 승인했다. report 스키마 DB16과 확인된 본인 관리자 계정 한 개의 임시 읽기 권한을 BEGIN/COMMIT으로 적용했다. 계정은 현재 로그인한 사용자 관리 상세의 자기 관리자 해제 버튼이 비활성인 점과 경로 ID로 대조했고, 관리자 수만으로 선택하지 않았다. 실제 계정 ID·개인정보는 문서에 기록하지 않는다.
- DB16 적용 중 기존 report 스키마 모든 테이블의 전체 원본 행을 임시 테이블에 보관하고 적용 후 전체 JSON 일치가 깨지면 RAISE로 취소하도록 검사했다. db16_applied_originals_preserved, 보고 8건 보존, 활성 임시 grant 1개, expires_at 2026-11-04 00:00 KST 확인. 기존 역할/소속은 변경하지 않았다. public/auth 변경 없음.
- 실제 로그인 계정의 authenticated RLS로 읽기 검증: 일반 보고8건, 수정 가능0/확인 가능0, 타인 기도0/타인 비공개0/명단0/보호자0. 자기 작성 보고의 기존 기도·비공개는 작성자 규칙으로 조회되며, 이를 타인 개인정보 공개로 표현하지 않는다. 본문과 개인정보는 출력·저장하지 않았다.
- f37c01a 일반 푸시 후 Vercel 4XPUD3DEt5zY4fZNYCzU5G63Kwy7 Production/Current/Ready(28초)를 확인했다. 운영 홈에 전체 현황(해당 주 제출3·작성중3·확인대기1), 만료 안내, 셀케어 링크0을 확인했다. 전체현황에서 기존 수요예배 보고를 열었으며 제목 표시/읽기 전용(제출·수정 버튼0)을 확인했다. 보고 내용은 문서·스크린샷에 저장하지 않았다.
- 화면 점검에서 임시 조회되는 자기 과거 초안에 이어쓰기 링크가 나오는 점을 발견해, home-overview와 홈에 실제 작성 가능 파트 ID 조건을 추가했다. 수정 후 lint, webpack build(29경로), tsc --noEmit 모두 통과했다. 소속/역할 자기 변경 제한을 풀거나 보고를 대신 저장하지 않았다.
- DB81개/lint/type/build는 34절 구현에서 수행한 검증이며 이번 턴은 위 운영 읽기검사와 추가 UI 수정 후 lint/build/tsc를 실제 수행했다. 제출 완료 팝업은 배포 코드에 포함됐으나 실제 운영 보고를 제출해 띄우는 검증은 하지 않았다. 테스트 보고/알림 발송 없음. 최상단 계정과 정식 담당 배정은 여전히 별도 과제다.

- 35절 최종 운영 배포: 9e6057b, Vercel 5Wde7nd6gAC3HcbPKQCSmEYqHoYK Production/Current/Ready(21초). 운영 홈에서 임시 열람 안내1/셀케어 링크0/작성 권한 없는 초안 이어쓰기0을 확인했다. 증빙 outputs/deploy_20261021/admin-setup-ready.png. 운영 DB16/임시 grant 유지. ADMIN_SETUP_ACCESS.md의 운영 상태 설명을 로컬 문서에 갱신했다.

## 37. 관리자 직접 보고 작성 탭 (2026-10-21, 로컬 구현)

- 사용자 요청: 관리 메뉴와 별도로 일반 작성자의 폼이 필요하고, 미리 담당 파트를 정해 주는 대신 본인이 보고를 추가하고 싶다고 정정했다.
- /write 작성 페이지와 홈의 보고 작성·추가 / 관리·제출현황 바로가기를 분리했다. 관리자에게 활성 하위 파트 선택→기존 새 보고 추가→같은 교육/기술/학교/캠퍼스·회의/공과 폼을 연결한다. 일반 작성자의 기존 담당 범위는 유지한다.
- 17번 migration 20261031000000_admin_report_author.sql: can_create_report(uuid), 활성 관리자의 자기 draft 생성/자기 보고 열람·확인 전 수정/제출 정책을 별도로 추가한다. can_write_group을 관리자 전체로 풀지 않아 모임 없음·타인 내용·명단·팀 이슈 작성·검토 권한은 늘리지 않는다. 만료 후에도 내 작성 보고는 작성자 권한으로 남고 타인 내용은 기존 만료/정식 권한을 따른다. 자기 소속 승격 제한도 유지한다.
- 교육부서 명단을 볼 수 없는 관리자가 학생이 있는 교육부서의 빈 출결 보고를 제출하는 경우 DB 트리거가 거부한다. 일반 내용 임시저장은 가능하며 담당 배정 필요 안내를 표시한다. 회의/공과는 출결 제외라 정상 제출 가능하다. 기술팀 이슈 작성은 기존 담당 권한을 확인해 무권한 버튼을 숨긴다.
- 변경: src/app/write/page.tsx, app/page, lib/access, groups/[id]/page, reports/[id]/page·actions, reports/page, 위 migration, tests/admin-author.test.mjs, package.json. 내 보고 필터는 해당 주 본인 보고가 없어도 전체 작성자로 풀리지 않도록 유지했다.
- 권한 테스트에서 관리자의 직접 생성→save_report 제출, 타인 보고 읽기/수정/대리 작성/확인/자가 담당 배정 차단, 교육부서 빈 출결 제출 차단, 관리자 해제 후 생성 차단을 검증했다. npm.cmd run test:db 전체 82개와 lint/build/tsc 검증을 진행했다. 신규 테스트 단독도 통과했다. 기존 Node 모듈 형식 경고 남음.
- 운영은 9e6057b / DB16이며 이 작성 기능은 아직 미적용이다. DB17 적용과 작성 화면 배포는 해당 범위 설명 후 별도 승인으로 진행한다. 실제 새 보고 저장/제출·알림은 생성하지 않았다. 루트/셀케어의 다른 작업을 보존했다.

- 37절 최종 검증 완료: 전체 DB 테스트 성공(82개 구성), lint 경고/오류 없음, webpack build 30경로 성공, tsc --noEmit 성공, git diff --check 통과. 작성 탭의 실제 브라우저/실계정 입력은 아직 미검증.

## 38. 파트별 직책·사진팀·본인 6개 배정안 (2026-10-21, 로컬 구현)

- 사용자 제공 파트별 직책 목록을 lib/positions.ts와 DB18 20261101000000_group_positions.sql에 반영했다. 사진팀은 예배/기술 분류의 별도 팀이며 담당교역자만 선택한다. 두 학교는 총괄/담임/파트, 교육부서는 교역자/총괄, 영상은 담당교역자/예배총괄/팀장/부팀장, 예배팀은 담당교역자/예배인도자, 음향·조명·자막은 담당교역자/오퍼레이터, 나머지는 담당교역자다.
- 본인 배정안(실제 계정 미반영): 예배팀 예배인도자(writer), 음향팀 오퍼레이터(writer), 조명팀 담당교역자(reviewer+교역자범위), 베리타스 기독국제중 파트(writer), 영상팀 예배총괄(reviewer·일반 열람), 부산 캠퍼스 담당교역자(reviewer+교역자범위). 본인 관리자 유지+교역자 플래그를 설정해야 하며, 다른 계정/소속은 변경하지 않는 범위로 운영 승인이 필요하다.
- membership.position nullable 추가, 파트별 직책/role 일치·교역자 자격 DB 검증, 기존 직책 없는 소속 보존, 명명된 직책을 미분류로 바꾸는 우회 차단. set_memberships는 기존행 갱신/신규 삽입/목록에서 빠진 행 삭제로 변경해 기존 미분류 소속도 유지한다. approve_user도 직책을 보존한다. 자기 배정·자가 교역자 승격 제한은 그대로다.
- assigned_clergy는 실제 해당 파트 교역자 직책만 인정한다. 한 사람이 여러 직급을 맡으면 group_content_layer/새 보고 stamp로 작성 파트의 당시 직급을 보존하고, same_content_layer는 보유한 각 직급의 동급 일반 열람을 인정한다. 기존 보고 직급·원문은 소급 변경하지 않는다. 조명/부산 교역자라는 이유로 학교 파트·영상 총괄의 비공개까지 열리지 않도록 검증했다. 임시 셋업 권한 만료와 별개로 정식 담당·동급·작성자 권한은 유지된다.
- UI: admin 사용자 승인/상세에 파트별 직책 선택, 교역자 미지정 계정의 교역자 선택 비활성, 오류 원인별 안내. 홈/사용자 목록에 실제 직책 표시, 작성 탭에서 본인 담당 파트 우선, 새 보고 담당 직책·파트를 본인 직책으로 미리 채운다.
- 변경 파일: migration18, lib/positions, components/membership-position-select, admin/users/page·actions·[id]/page, app/page·write/page·groups/[id]/page, tests/positions.test.mjs, package.json, docs/GROUP_POSITIONS.md. 직전 DB17/작성 탭 작업도 미배포 상태로 함께 보존했다.
- 이번 검증: 직책/앱·DB 선택지 일치·사진팀·복수 직급·담당 비공개·위조/자기 변경 차단·기존 보고/소속 보존/신규 승인 테스트 통과. 중간 set_memberships의 PL/pgSQL 변수/별칭 a 충돌을 수정 후 재실행했다. lint 경고/오류 없음, webpack build 30경로 성공, tsc --noEmit 성공, diff --check 통과. 기존 Node 모듈 형식 경고 남음. 전체 DB 테스트를 최종 재실행 중이며 완료 결과는 아래에 이어 기록한다.
- 운영은 9e6057b / DB16으로 유지한다. DB17→18 적용, 사진팀 운영 추가, 본인 역할·6개 배정, 작성 탭·직책 UI 배포는 아직 하지 않았다. 실제 새 화면·운영 계정 배정 후의 동작은 미검증이며 테스트 보고·알림은 생성하지 않았다. AGENTS.md의 별도 DB 변경·배포 승인에 따라 구체 배정 범위와 함께 운영 반영 승인을 받는다. 루트/셀케어의 다른 작업은 보존했다.

- 38절 최종 전체 DB 검사 완료: 83개 통과, 실패 0. 운영 반영 없이 로컬 검증만 수행했다.
