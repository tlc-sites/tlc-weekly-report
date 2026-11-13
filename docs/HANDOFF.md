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

### 2026-10-21 직책·작성 탭 운영 반영 완료
- 사용자 배포 승인에 따라 DB 17→18 적용 후 본인 관리자 계정의 교역자 플래그와 요청한 6개 직책을 배정했다. 관리자 유지, 타 사용자 소속 보존. 상세 직책은 docs/GROUP_POSITIONS.md 참조.
- 기존 report 스키마 행 스냅샷을 트랜잭션 내 비교했다. 승인된 본인 역할·자동 수정 시각 외 기존 값 보존을 확인했다. 적용 시 기존 보고 10건. public/auth 변경 없음.
- 사전 점검의 profiles 상태 컬럼 오기 및 자동 updated_at 비교로 최초 시도들은 롤백됐다. 수정 후 원자적 적용 성공.
- 운영 소스 d26327f, remote master 정상 푸시. Vercel 5j5QyUdjoajmnt1Pfe7hcNyMVsLY Production Ready, 36초, tlc-weekly-report.vercel.app 반영 확인.
- 이번 실행: npm run test:db 83/83 통과, staged diff --check 통과. lint/tsc/webpack build는 배포 준비 단계에서 통과했고 이번 Vercel 빌드 성공.
- 운영 UI에서 /write 분류, 사진팀, 본인 6개 직책 선택값, 예배팀 새 보고 폼의 예배인도자 자동 입력 확인. 실제 새 보고 생성·제출은 수행하지 않았다.
- 증빙: outputs/deploy_20261021/positions-writing-ready.png (루트 출력 폴더).
- 임시 관리자 일반 내용 열람 종료 2026-11-04 00:00 KST 유지. 담당 직책/동급/본인 작성 등 정상 권한은 별개다. 담임목사님·사모님 계정 배정은 이메일 수령 후 별도 진행.
- 변경 파일: src/app/write, admin/users, groups/[id], reports, 홈, src/lib/access.ts·positions.ts, membership-position-select, migrations 17·18, 권한 테스트, package.json, 관련 운영 문서. 코드 운영 반영 완료. 이 배포 영수증 문서는 로컬 후속 기록이다.

## 39. 우상단 알림함·피드백 답글·최상단 호칭 (2026-10-21, 로컬)
- 요청: 푸시 클릭 시 원문 이동, 우상단 종 모양으로 받은 내용 확인, 담임 목사님·담임 사모님 코멘트 답글, 두 분 호칭 통일.
- 변경 파일: layout 및 account-notifications/notification-bell, notifications/actions, feedback-replies, 보고 review/incident-feedback, public/sw.js, lib/push·notices·reminders, 호칭이 있는 UI, 신규 DB19 20261102000000_inbox_replies.sql, tests/inbox-replies·push-navigation, package.json.
- DB19: report.inbox_notifications와 보고/이슈 피드백별 reply 테이블. 본인 알림만 SELECT, 읽음은 본인 전용 RPC. 원문 보고/이슈/공지 권한 재검사, 관리자 URL은 관리자만. 답글은 활성 원문 열람자만 본인 이름으로 작성하며 기존 최상위 피드백은 교역자 이상 유지. 피드백/답글 INSERT 시 보고 작성자/원 코멘트 작성자에게 원문 링크가 있는 알림 생성. 본인에게는 중복 알림 제외. 기존 행/역할/public/auth 변경 없음.
- 알림함은 종을 눌러 최근50건 제목/내용/읽음과 원문 링크 표시. 기존 푸시 이벤트는 발송 시점부터 저장하며 과거 알림 복원은 하지 않는다. 공지 내용 본문은 현재 기존 안전한 안내문으로 표시되고 상세는 원문에서 읽는다. 피드백·답글은 알림함 등록이며 해당 이벤트의 새 OS 푸시 발송은 추가하지 않았다.
- SW는 기존 창 navigate 완료 후 focus, 닫힌 창은 다른 창/새 창으로 fallback. 외부 origin 차단 유지. 호칭은 UI 표시만 변경하고 DB role key 유지.
- 검증: 최종 npm run test:db 85/85 통과(수신인 격리/위조·비열람자 답글 차단/작성자 답글/읽음 격리/비활성·원문 제한/보고·이슈 알림 링크/푸시 이동 순서·닫힌창·외부주소), lint 성공, webpack build 30경로 성공, tsc --noEmit 성공, diff --check 통과. 이슈 테스트의 권한 없는 fixture 삽입을 authenticated 작성자로 바꾼 뒤 재통과. 기존 Node 모듈 형식 경고만 남음.
- 실제 브라우저/휴대폰 시각 확인과 OS 푸시 탭 동작은 미검증. 운영은 d26327f / DB18 유지. DB19 적용·배포·실제 보고/댓글·알림 발송은 하지 않았다. AGENTS.md의 신규 DB/배포 승인 후 운영 반영할 것. 루트/셀케어 및 직전 배포 문서 변경 보존.

## 40. 교역자 공동 주중 기도회·최상단 비공개 메시지 (2026-10-21, 로컬)
- 사용자가 DB19·알림함 배포를 승인한 뒤 추가 기능을 요청했다. 중단까지 포함하지 않고 교역자 이상만 기도회 보고 작성·공유, 메시지는 두 분과 지정 교역자만 열람·답장으로 명시 확인했다.
- 신규 DB20 20261103000000_prayer_minister_messages.sql: prayer_meeting_reports에 이름 필수/미래날짜 차단/말씀·내용·기도제목·특이사항 기록. 활성 is_clergy만 SELECT/INSERT하며 admin 단독·총괄·팀원·대기는 불가. 기존 보고/기도제목 권한 확대 없음.
- minister_threads/messages는 두 분만 대화 시작, 활성 교역자에게만 발송, 지정 교역자는 답장 가능. 두 분과 지정 수신자만 원문/알림을 읽으며 다른 교역자·기능 관리자·중단·대기 차단. 역할 회수 시 수신인 열람도 회수한다. 대화+첫 본문은 RPC 한 트랜잭션으로 저장한다. 메시지 알림은 본문/제목 미리보기를 노출하지 않고 원문 링크만 안내한다. 실제 메시지 전송/푸시 없음.
- 홈에 교역자 전용 주중 기도회 보고·비공개 메시지 메뉴 추가. 신규 app/prayer-meetings 및 app/messages 페이지/서버액션. 기도회 최신50건 공유, 메시지 최신50대화와 시간순 본문·답장. 두 분 계정 미배정 상태는 유지하며 임의 역할 시드 없음.
- 검증: 최종 전체 DB86개 통과, lint 성공, webpack build33경로 성공, tsc --noEmit 성공, diff --check 성공. 신규 tests/prayer-messages.test.mjs에서 모든 권한/미래날짜/빈 본문 원자적 롤백/역할회수/수신인 알림 격리 검증. 최초 thread SELECT helper가 INSERT RETURNING 새행을 보지 못하는 문제를 직접 행 정책으로 수정 후 통과.
- 운영 DB18/d26327f 유지. DB19 기존 승인 유효. 추가 DB20 운영 적용 승인은 아직 받지 않아 DB19와 함께 묶은 전체 앱을 운영에 배포하지 않았다. 추가 DB20 승인 후 DB19→20 원본 보존 비교 적용, 전체 코드 배포·운영 화면 확인 필요. 실제 브라우저·휴대폰 검증은 아직 없음.
- 루트/셀케어의 기존 수정과 직전 배포 기록 보존. 변경 파일은 위 신규 페이지/액션/DB20/테스트/package.json 및 홈, 직전39절 수정들이다.

### 2026-10-21 DB19·20 배포 승인 후 연결 장애
- 사용자가 DB19·20과 전체 앱 배포를 승인했다. 재승인 필요 없음.
- 이번 확인: root/worktree status와 HANDOFF, diff 검토. 구현 검증86개/lint/webpack build/tsc는 직전 구현 턴 결과이며 이번 실행에서 재실행하지 않았다.
- Chrome 연결이 여러 번 timeout 후 reset됐다. getBrowser(chrome)는 브라우저3을 반환했으나 새 탭 생성/접근도 timeout. SQL 입력/Run은 실행하지 않았으므로 운영 DB 변경은 수행하지 않았다. 직접 DB/배포 CLI·환경 인증은 현재 작업 환경에 노출되어 있지 않았다. 비밀 값 조회·복사 없음.
- 준비 코드 3bc9a80 커밋 완료. DB 선적용을 보장하기 위해 원격 푸시하지 않았다. 운영은 d26327f/DB18 유지. staged 검사에서 발견한 DB20 EOF 여분 빈 줄을 로컬에서 정리했다. 이 문서와 공백 정리는 후속 로컬 변경이다.
- 남은 일: Chrome 확장 연결 복구→Supabase DB19→20 원본행 스냅샷 비교·트랜잭션 적용→후속 기록 커밋→HEAD:master 일반 push→Vercel Ready/운영 화면/알림함 확인. 기존 승인 범위로 재개 가능하며 실제 보고·메시지 시험 발송은 하지 않는다.

### 2026-10-21 사진팀 담당교역자 추가 요청 (운영 대기)
- 사용자가 본인에게 사진팀 담당교역자 추가를 명시 요청했다. 기존 관리자+교역자와 6개 소속은 유지하고 사진팀 position=담당교역자/role=reviewer 1개만 upsert하는 범위로 승인됐다. 새 역할 정의/마이그레이션 불필요, DB18 선택지에 이미 존재한다.
- Chrome 재연결을 확인했으나 새 탭 열기/운영 사용자 관리 접근에서 다시 timeout. 실제 계정 재대조/저장/SQL 실행은 하지 않았다. 운영 배정 완료로 표시하지 않는다.
- 연결 복구 후 본인 로그인 계정과 기존 소속을 확인하여 사진팀 1개만 추가, 타인/기존 소속 보존 후 7개 배정 확인 필요. DB19·20/앱 배포 승인도 유효하게 대기 중이다. 계정 ID는 문서에 기록하지 않았다. 이번 변경은 요청·승인 인수인계 문서뿐이며 코드/DB 검사는 재실행하지 않았다.

## 41. 보고 후 소통·모임별 반복 알림·팀/부산/기도회/명단 정리 (2026-10-21, 로컬)
- 사용자 8개 요청 반영. 확인 답변: 미제출 시 종료+3시간부터 2시간마다 담당자와 두 분에게 반복, 부서 시간은 담당 교역자가 설정. 중등/고등은 기존 별도 유지하고 출생연도 표시만 추가.
- DB21 20261104000000_meeting_deadlines_directory.sql: 안내팀/송번역팀 및 공통예배 연결, 기도회 인도자/참석명단 컬럼, 권한과 별개 team_directory(담당 교역자/최상단 관리·활동제외/복귀), 모임 마감 설정과 서비스 전용 중복 claim RPC. 신규 객체 모두 report. 원래 보고·소속·그룹 이름/ID·public/auth는 변경하지 않는다.
- DB21 스케줄은 알려진 예배 종료 시각을 반영하며 금요 월 주차 및 KST/익일을 따른다. 부서 미설정 시간은 추측하지 않는다. 설정 이후 종료 건부터 미제출 작성자/담당 교역자별 검사, 초안은 미제출, 제출/확인과 모임 없음은 중단. 시간 재설정/재활성화 시 시작점 갱신. 일반 로그인 사용자는 claim RPC 접근 불가. 명단 등록만 한 비계정 팀원은 제출 의무/권한 부여 없음.
- UI: 보고 하단 코멘트/답글 유지·명칭 명확화; 제출 성공 팝업 종료 후 해당 팀 주차 메인 이동; 학교 표시 이름에 출생연도; 부산 8개 접힘 영역+기존 방문경비 자료 보존(기존 필수 항목을 신규 sections 모드 제출에 강제하지 않음); 기도회 인도자/참석명단; groups/[id]/team·schedule 추가, 담당 교역자가 명단/시간 관리. 예배/기술팀 사역 보고 안내와 입력란 수정도 포함.
- 반복 알림 /api/cron/meeting-deadlines, lib/meeting-reminders, .github/workflows/meeting-reminders.yml 준비. Vercel Hobby 일단위 제한 공식문서 확인. GitHub 변수 REPORT_MEETING_REMINDERS_ENABLED=true + Secret REPORT_CRON_SECRET(운영 CRON_SECRET과 동일)을 승인 후 안전하게 설정해야 한다. 현재는 변수 기본 미설정으로 실행 비활성. 5분 폴링·예약 지연 가능, 3시간 기준 2시간 bucket 중복방지. 실제 알림 발송/설정 변경은 하지 않음.
- 테스트: 최종 전체 DB88개 통과, lint 오류/경고 없음, tsc --noEmit 성공, webpack build35경로 성공. 그 이후 읽기 화면 라벨·schedule 재시작 트리거 변경 후 DB88/lint/tsc 재통과. diff 확인. 신규 테스트에서 종료2시간59분 미전송/3시간 발송/같은구간 중복차단/2시간 직전 미반복/2시간 뒤 반복/제출자 즉시중단/모두제출 최상단 중단, 명단 무관교역자·관리자·작성자 변경 차단과 권한 부여 없음, 새 팀/부산필수/학년 표시 검증. 테스트 Node 모듈 형식 및 stripTypeScriptTypes 실험 경고는 남음.
- 변경 파일: 위 DB21·workflow, lib/meeting-reminders·group-display·report-forms, group-picker·submission-receipt, groups/[id]/page·team·schedule, prayer-meetings/actions·page, reports/[id]/page·campus-form·review·worship-form, cron route, tests/deadlines-directory.test.mjs, package.json, docs/MEETING_REPORT_UPDATES.md. 직전 DB20 EOF 공백 정리·사진팀 배정/배포 대기 기록도 보존.
- 운영: 마지막 확인 운영 d26327f/DB18, 3bc9a80은 로컬 커밋. DB19·20 및 사진팀 본인 추가 승인 유효. 추가 DB21·새 Actions 설정/활성화는 새 운영 승인 필요. 이번 DB/배포/역할/실제 보고/알림 변경 없음. 브라우저 연결은 직전 실패 이후 이번에 다시 시도하지 않았으며 실화면 미검증. 셀케어/루트 다른 도구 수정 보존.

## 42. 버건디 로고·파비콘·설치 아이콘·테마 (2026-10-21, 로컬)
- 사용자가 첨부한 버건디 바탕/흰색 TLC Report 로고와 동일한 원본을 확인했다. public/icons/weekly-report.png에 원본을 그대로 복사했고 SHA256 동일성을 확인했다. 로고 재해석/재생성 없이 기존 sharp 스크립트로 표준 아이콘을 축소 생성했다.
- 생성: 192/512 앱 아이콘, 180 apple-touch, 32 favicon PNG, 16/32/48 ICO, 버건디 여백의 maskable512. 알림 배지는 기존 흰색 십자가 유지. manifest/layout/SW 아이콘 URL 버전 burgundy-report-20261021로 갱신했다.
- 테마: accent #692d2d, background #f8f4f0, surface #fffdf9, foreground #352b2b, muted #75605c, border #e2d4ce, accent-soft #f0e2dc, focus #aa6862. 버튼·톤 아이콘은 기존 accent 변수를 따르며 manifest/viewport의 앱 테마도 일치시켰다. 글꼴·이름·기능·권한은 보존했다.
- 변경 파일: public/icons의 원본/생성물, src/app/favicon.ico, globals.css, layout.tsx, manifest.ts, public/sw.js, scripts/generate-icons.mjs. 직전 기능/DB/문서 변경과 셀케어 다른 작업은 보존했다.
- 이번 검증: icon 192/512/maskable512/apple180/favicon32/badge96 크기 확인, 원본 파일 해시 동일, 흰색 버튼 글자 대비10.43:1/본문12.53:1/보조문구5.35:1, lint 성공, webpack build35경로 성공, tsc --noEmit 성공, diff --check 통과. DB 로직 변경이 없어 DB 테스트는 재실행하지 않았다.
- 미리보기 outputs/report-theme/theme-preview.png 생성 후 직접 확인했다. 실제 앱 화면 캡처가 아닌 색상·로고/버튼 견본이며 개인정보는 없다. SVG 렌더링 중 fontconfig 캐시 쓰기 경고가 있었으나 PNG 결과는 정상 확인했다. 실브라우저/설치 기기 동작은 미검증.
- 운영 반영: 이번 아이콘·테마는 로컬만 변경. push/배포/DB/계정·사진팀 배정/새 알림 활성화 없음. 마지막 확인 운영 d26327f/DB18. DB19·20/사진팀 승인 대기 작업은 보존, 새 DB21·Actions 활성화와 이번 테마 포함 배포는 구체 승인 후 진행한다.

## 43. 버건디 테마·DB19~21·사진팀·반복 예약 운영 반영 (2026-10-21)
- 사용자 배포 요청으로 준비된 전체 범위(DB19→20→21, 사진팀 담당교역자 추가, 새 예약 실행 설정, 테마/아이콘)를 운영 반영했다. Chrome 연결이 브라우저2에서 복구돼 CUA로 진행했다.
- 본인 계정은 운영 사용자 상세의 자기 관리자 해제 버튼 비활성으로 다시 대조했다. 계정 ID/연락처는 기록하지 않는다. BEGIN 안에서 기존 report 전체 테이블 원본 행을 임시 보존하고 적용 후 기존 키의 JSON 포함 비교로 보존을 검증했다. 신규 컬럼은 허용하고 승인된 본인 사진팀 소속만 추가·갱신 허용했다. DB19-21 applied; originals preserved, 기존 보고12건, 본인 소속7개, 모임마감 일정118개 확인. public/auth 객체 변경 없음.
- 사진팀 position=담당교역자/role=reviewer 추가, 기존 관리자+교역자/6개 담당 유지. 사용자 상세에서 사진팀 직책과 총7개 선택을 확인했다. 최상단 계정 임의 배정은 하지 않았다.
- 72f413d 커밋(직전 3bc9a80 포함)을 HEAD:master 일반 푸시했다. 운영 Vercel 5UoRh7dpVU9vkCwMmjMU7L9dyTKK Production Ready, 36초. 공개 production API/manifest/아이콘이 새 코드임을 확인했다.
- 반복 알림: Vercel 기존 CRON_SECRET은 민감 변수라 Copy가 비활성이었다. 기존 로컬 설정의 동일 키를 값 출력/문서/로그/명령 인자 복사 없이 읽어 운영 endpoint dryRun=1로 인증만 확인했다(status400와 예상 dryRun 미지원 안내). 실제 claim/알림 없음. 검증된 기존 값을 GitHub REPORT_CRON_SECRET encrypted secret으로 등록하고 REPORT_MEETING_REMINDERS_ENABLED=true 저장을 UI에서 확인했다. 키 값은 runtime에서 제거했고 소스/커밋/로그에 기록하지 않았다. 서버의 기존 키를 변경/회전하지 않았다.
- GitHub 5분 예약은 활성화. 수동 Run workflow 최종 실행은 자동 승인 검토가 거절했다: 반복 예약 활성화 승인과 별개로 즉시 담당자·두 분께 실제 알림을 보낼 수 있는 수동 발송은 명시 승인되지 않았다는 사유. 재시도/다른 API 우회 실행하지 않았으며 실행 확인창을 닫았다. 실제 예약 실행/첫 전송 성공은 아직 미확인이다. 사용자가 즉시 수동 발송을 별도 승인하면 워크플로로 확인할 수 있다.
- 운영 UI: 버건디 accent/background, 종 알림함 빈 상태, 기도회 인도자/참석명단 입력, 안내팀/송번역팀, 부산 팀원 추가 폼/모임 시간 페이지, 비공개 메시지 페이지·비최상단 새 메시지 시작 폼 숨김 확인. 새 보고/팀원/댓글/메시지는 작성하거나 제출하지 않았다. 실제 부산8개 입력·제출팝업·실기기 푸시는 미검증.
- 공개 manifest theme #692d2d, icons3개와 운영 512아이콘 해시가 로컬 원본과 일치함을 API로 확인했다. 브라우저 DOM에서도 accent #692d2d/background #f8f4f0 확인. 사전 DB88/lint/tsc/webpack build는 직전 구현/테마 턴 결과이며 이번 턴에는 재실행하지 않았다. 이번 검증은 staged diff --check, 운영 데이터 보존 검사·UI·API·Vercel 빌드다.
- 증빙 outputs/deploy_20261021/burgundy-ready.png, burgundy-inbox-live.png, meeting-reminders-enabled.png. 앱 화면은 빈 기도회/알림함이며 타인 본문·개인정보가 없다. 스크린샷 직접 확인했다.
- 최종 운영: DB21/앱72f413d, 사진팀 포함 본인7개 소속. 관리자 임시열람 만료 2026-11-04 00:00 KST 유지. 두 분 계정 배정과 부서별 시간 설정/예배별 담당 소속 점검은 여전히 필요하다. 코드 worktree는 배포 시점 clean, 이후 이 운영 영수증 문서만 로컬 갱신. 셀케어/루트 다른 도구 수정 보존.


## 2026-10-21 기도회 오전·저녁 및 참석명단 최종 반영 (로컬)
- 최신 요청: 참석명단 유지. 오전기도회 월·화·목·금 10:00, 저녁기도회 월·화·수·목 20:30. 날짜·구분·참석명단·기도제목만 입력하며 작성자는 자동 기록, 보고 아래 코멘트 제공. 허용 요일과 미래 날짜는 서버와 DB23에서 검증한다. 기존 기록은 보존한다.
- 변경: src/app/prayer-meetings/page.tsx·actions.ts, DB23 및 tests/prayer-weekly-email.test.mjs. 누적 대기 작업은 DB22 스데반 3개 반/출결·관리자 교역자 지정·초안 삭제 보정, DB23 기도회 코멘트/주간 메일, weekly-summary 관련 파일. setMinister의 구형 최상단 전용 서버 차단도 제거하여 DB 권한과 일치시켰다. 기존 통합 테스트의 인턴십 원본 그룹 조회는 parent_id is null로 한정했다. .env.example에 메일 변수 자리표시자를 추가했다.
- 이번 실행 검증: npm run test:db 91/91 성공, npm run lint 성공, npx tsc --noEmit 성공, npm run build -- --webpack 37경로 성공, git diff --check 성공(LF/CRLF 안내만). 운영 UI/실제 발송 미검증.
- 운영 반영 없음: 운영은 앱72f413d/DB21 유지. DB22·23 적용, 담임 사모님 계정 역할 배정, 커밋·푸시·배포가 남아 있다. 주간 메일은 GMAIL_USER/GMAIL_APP_PASSWORD 및 WEEKLY_EMAIL_ENABLED를 운영에 안전하게 설정해야 하며 실제 발송은 하지 않았다. 계정 이메일·비밀 값은 문서에 기록하지 않는다.


### 2026-10-21 최신 배포 요청 — 브라우저 연결 차단
- 사용자가 최신 준비 변경 배포를 요청했다. 관련 diff와 운영 상태를 확인했다. Chrome 브라우저 연결이 두 차례 timeout 후 초기화되었다. Windows Computer Use 복구도 현재 브라우저 URL을 신뢰성 있게 확인할 수 없어 정책상 해당 턴 작업 중단을 통보했다. 추가 UI 입력은 하지 않았다.
- 이번 시도에서 운영 SQL 실행/역할 배정/커밋/push/앱 배포/실제 발송은 전혀 하지 않았다. 앱72f413d/DB21 유지. 앞선 로컬 검증91개 성공 및37경로 빌드 결과는 이전 턴 결과이며 이번에는 재실행하지 않았다. Chrome 연결 복구 후 DB22·23 적용과 원본 보존 검증을 먼저 수행하고 배포해야 한다. 메일 자격증명 미설정 상태 및 다른 도구 수정 보존.


### 2026-10-21 배포 재시도 결과
- 사용자 재시도 요청으로 브라우저 연결 재확인. Chrome 확장은 목록에 표시되지만 전체 상태/새 탭 열기/기존 탭 목록 조회 모두 약30초 timeout. 문서의 browser-troubleshooting도 확인했으며 실제 SQL 편집기에 접근하지 못했다.
- 대체 CLI 경로 확인: 로컬 설정에 DB 연결/관리 API/배포 인증 변수 이름이 없으며 supabase/vercel/psql 명령도 없다. 자격증명 값은 조회·출력하지 않았다.
- 운영 DB 적용/계정 역할 변경/커밋·push/배포 모두 미실행. 운영 앱72f413d/DB21 유지, 작업 파일 보존. Chrome의 브라우저 연결 확장 재연결 후 이어서 진행 필요.


### 2026-10-21 이어서 배포 — 수동 DB 실행 파일 준비
- Chrome 탭 조회가 다시30초 timeout. 운영 변경 없음, 앱72f413d/DB21 유지. 더 이상의 재시작을 요청하지 않고 outputs/report-deploy/apply-db22-db23.sql을 준비했다. DB22·23을 단일 트랜잭션으로 적용하며 report 기존 행 보존과 새 테이블 RLS를 검사한다. 이미 적용된 경우 중단한다. 계정 배정/메일 발송은 포함하지 않는다. 이 합본 파일 자체는 아직 운영 실행하지 않았다.
- 사용자가 Supabase SQL Editor에서 합본 전체를 실행하여 성공 확인 후 앱을 커밋·push해야 한다. 기존91개 테스트/빌드 결과는 앞선 턴 결과. 브라우저 연결이 계속 차단되므로 수동 DB 적용 완료 확인이 필요하다.


### 2026-10-21 합본 SQL 임시 테이블 오류 수정
- 사용자가 report_deploy_original_rows relation does not exist 오류를 제공했다. 정확한 운영 부분 적용 상태는 미확인. 합본은 pg_temp 명시 참조 및 단일 DO 문 안에서 전체 배치 실행으로 변경하여 중간 statement 분할/임시 테이블 수명 문제를 방지했다. 이미 DB22 또는23이 존재하면 적용 전 중단한다. 기존 행 보존 검증과 새 테이블 RLS 검증을 유지했다.
- outputs/report-deploy/apply-db22-db23.sql 및 worktree/scripts/apply-db22-db23.sql 갱신. tests/deploy-bundle.test.mjs 추가, 직접 실행1/1 성공(기존DB21 준비→합본 전체 실행→기존 그룹 행 보존→RLS4개→중복실행 차단). 첫 테스트 명령은 루트 cwd 오류로 파일을 못 찾았고 worktree에서 재실행 성공. 운영 재실행/앱 배포는 하지 않았다. 사용자는 수정본 전체 실행 필요.


### 2026-10-21 운영 적용 상태 확인 필요
- 사용자가 수정 합본의 already present 사전 검사 오류를 제공. 최소 DB22 테이블 또는 DB23 컬럼이 이미 존재함이 확인되며, 운영을 DB21만이라고 단정할 수 없다. 이전 최초 합본이 부분 실행되었거나 이미 적용됐을 수 있으며 전체 적용 여부는 미확인이다. 재적용/삭제는 하지 않는다.
- outputs/report-deploy/check-db22-db23.sql 읽기 전용 검사 준비: 신규 테이블/컬럼/함수/트리거 존재, RLS·정책, 변경 함수 정의, FK, 스데반 반 이름만 조회. 계정·보고 본문·비밀 값은 조회하지 않는다. 사용자가 결과를 제공하면 누락 부분만 판단 후 앱 배포한다. 이번에는 코드 변경/검증 재실행/운영 변경 없음.


### 2026-10-21 재배포 준비 커밋
- 사용자 재배포 요청. Chrome 탭 조회 timeout 지속. 기존 공개 API 키를 runtime에서 읽어 limit=0 읽기 전용 조회를 시도했고 외부망 허용 후6개 요청 모두401/42501로 거절됐다. 본문/개인정보/키 출력 없음. 서버 secret key는 로컬 미설정으로 관리자 조회 불가. 이 응답만으로 신규 객체 완전 적용을 확인할 수 없다.
- 변경29파일을 fc8eaf4 로컬 커밋으로 확정, staged diff --check 성공. push/운영 앱 배포 없음. 이전91개 테스트 및 합본1개 테스트 결과는 앞선 턴 결과. 운영DB는 스데반3반 존재만 사용자 화면으로 확인, 나머지는 미확인.
- 사용자 실행 혼동을 줄이기 위해 첫 상태 조회만 포함한 outputs/report-deploy/check-db22-db23-status.sql 별도 준비. 그 결과 확인 후 HEAD:master push 및 Vercel 배포 확인 필요.


### 2026-10-21 DB 상태 확인 후 운영 브랜치 푸시 완료
- 사용자 스크린샷으로14개 검사 항목 present=true, 신규4테이블 RLS=true 확인. 앞선 스데반3반 생성 화면도 확인됨. 세부 정책/변경함수 본문/기존행 보존 검증 성공 결과는 미수령이므로 그 부분 검증 완료라고 표현하지 않는다. DB22·23 필수 객체는 존재한다.
- fc8eaf4f8a68902440cb3f70bce8fe577c419a9b를 origin HEAD:master 정상 push 성공(72f413d→fc8eaf4). 원격 배포 시작 트리거 반영. 이번 새코드 변경/테스트 재실행은 없으며 기존 검증91개+합본1개/37경로 빌드 결과는 이전 턴 결과다.
- 공개 운영 GET login200, weekly-summary307→login, prayer-meetings307→login 확인. 이 경로 응답은 전체 경로 로그인 미들웨어 특성상 새커밋 반영의 확정 증거는 아니다. GitHub connector combined status는 빈 배열을 반환해 Vercel Ready/배포ID는 미확인.
- Git credential fill로 인증정보를 직접 읽어 GitHub API 상태를 조회하려던 추가 명령은 자동승인 검토가 credential probing 위험으로 거절. 명령 실행 안 됨, 우회하지 않음. 따라서 인증정보 추출/저장/출력 없음.
- 남은 일: Vercel에서 fc8eaf4 Production Ready 확인, 로그인 운영 새폼 점검, 담임 사모님 계정 최상단 역할 배정(미실행), 운영 주간메일 자격증명 설정/활성화(미실행). 실제 메일/푸시 수동 전송 없음. 루트·셀케어 다른 작업 보존.


### 2026-10-22 교역자 드롭다운 선택 차단 수정 (운영 대기)
- 사용자가 교역자 직책을 선택 자체가 안 된다고 확인. 기존 MembershipPositionSelect는 대상 is_minister=false일 때 교역자 옵션 disabled여서 별도 역할 버튼을 먼저 눌러야 했다.
- admin/users/[id]/page.tsx에서 관리자에게 허용된 타인 소속 편집 시 교역자 옵션을 선택 가능하게 하고 설명 수정. actions.ts는 새 set_memberships_with_minister RPC 호출. DB24 20261107000000_assign_minister_memberships.sql은 기존 관리자 권한/자기 소속 금지/최상단 제한을 유지하며 활성 대상 행 잠금 후 필요한 교역자 지정과 기존 set_memberships를 한 트랜잭션으로 실행한다. 실패 시 교역자 지정도 롤백.
- tests/minister-assignment.test.mjs 추가: 역할+소속 저장, 비관리자/자기승격/anon 차단, 중복 소속 실패 시 역할 및 소속 롤백. package.json test:db에 포함. 이번 npm run test:db92/92, lint, tsc --noEmit, webpack build37경로 모두 성공. UI 운영 검증 없음.
- 운영 DB 적용/배포/계정 변경은 아직 하지 않았다. DB24 수동 실행용 outputs/report-deploy/apply-db24.sql 준비. DB24+앱 변경에 대한 운영 반영 승인 필요. 이전 fc8eaf4 원격 master 푸시는 완료이며 VercelReady 확인은 여전히 미완료. 다른 로컬 수정 보존.


### 2026-10-22 DB24 및 앱 반영 승인 후 연결 차단
- 사용자 진행으로 DB24+앱 배포 승인됨. 운영 SQL 편집기 새탭 연결이 다시 약30초 timeout. DB24를 적용하지 못했으므로 의존 앱은 push하지 않았다. 승인 유지, 재승인 불필요.
- 교역자 선택 수정5파일은 로컬 커밋 확정(staged diff check 성공). 사용자 문서 변경과 다른 작업 보존. 운영 DB/실제 계정은 변경하지 않았다.
- outputs/report-deploy/apply-db24.sql은 단일DO로 함수 생성·권한 설정을 원자적으로 실행하고 db24_ready/authenticated_allowed/anon_blocked를 한 결과로 확인한다. 현재 사용자가 SQL Editor에서 전체 실행 후3항목true 확인이 필요하다. DB24 완료 확인 뒤 준비된 커밋 HEAD:master push 및 배포상태 확인. 이번 턴 테스트 재실행 없음,92개/37경로 검증은 앞선 구현 턴 결과.


### 2026-10-22 교역자 지정 수정 운영 브랜치 반영
- 사용자 DB24 결과 화면 db24_ready/authenticated_allowed/anon_blocked 모두true 확인. DB24 함수 존재와 authenticated실행/anon차단 확인됨. 사용자가 실제 타인 교역자 지정 저장까지 성공했는지는 미확인.
- 승인된5279e0a 커밋을 origin HEAD:master 정상push(fc8eaf4→5279e0a). 프로덕션 login HTTP200. GitHub combined status 조회는 빈배열, Vercel브라우저 연결은32초 timeout이므로 최신커밋 ProductionReady 상태는 아직 확인하지 못했다. push성공과 배포완료를 구분한다.
- 이번에는 코드/DB 추가수정이나 실제계정 배정 없음. 기존92개테스트/lint/tsc/build37경로 성공은 이전 구현턴 결과로 유지, 이번 재실행하지 않음. docs/HANDOFF만 로컬 영수증 추가, 다른 작업 보존.
- 남은 일: Vercel5279e0a Ready 확인 후 관리자→타인사용자→소속과역할에서 담당교역자선택/저장 실제확인. 본인소속변경제한은 유지. 주간메일 설정과 담임사모님 최상단 역할 배정은 별도 미완료.


### 2026-10-22 배포 생성 재개 중 브라우저 연결 사라짐
- 직전 턴 Chrome 복구 후 Vercel Deployments→Create Deployment까지 접근, Branch Commit URL에 master 입력. 생성 버튼 클릭은 하지 않았다. 이후 이어서 요청에서 REPL binding 소실, 새 탭 요청은 Browser is not available: chrome. 현재 listBrowsers 결과 빈 배열. 배포 생성/재배포는 실행되지 않았다.
- 운영 DB24 확인과 origin/master5279e0a 유지. 작업 변경 없음. Chrome을 현재 대화의 브라우저 연결로 다시 제공해야 Create Deployment master 선택부터 재개 가능. 과거 에러 시간초과와 현재 브라우저0개 상태를 구분한다.


### 2026-10-22 교역자 선택 수정 운영 배포 완료 확인
- 사용자가 제공한 Vercel 화면에서5279e0a / Allow direct minister selection / Production / Ready /18초 확인. 최신 교역자 직접 선택 수정이 운영 배포됐음을 확인했다. 앞선 DB24검사3항목true와 함께 DB·앱 필수 반영 완료.
- 이번 확인은 사용자 화면 증빙이며 직접 브라우저 접속·실제 타인 교역자 선택/저장 성공까지 검증한 것은 아니다. 코드/DB추가변경·수동알림발송·테스트재실행 없음. 실제 관리자→다른사용자→소속과역할→담당교역자선택→소속저장 확인이 남음. 본인소속변경 제한 유지.


### 2026-10-22 사진팀 분류·담당 팀 관리 탭 (로컬)
- 사진팀은 groupCategory에서 예배/기술팀으로 명시 분류. DB25 20261108000000_photo_worship_category.sql은 잘못된 사진팀 type만 worship으로 보정, ID/소속/보고/명단 보존. 기존DB18 생성시 이미worship이라 정상데이터는 무변경.
- src/app/team-management/page.tsx 신규: 홈 교역자 관리 링크에서 진입, 최상단은 전체·담당교역자는 assigned_clergy RPC가허용한 파트만 표시. 기존 team_directory RLS 재사용, 관리자라는 이유만으로 타팀명단 수정권한 부여하지 않음. 로그인/보고권한과 단순명단 등록 분리 유지.
- 팀 명단 화면에 이름·역할 수정 및 저장상태 추가, updateTeamMember 서버액션은 기존 UPDATE RLS와 행반환으로 성공 검증. 변경 src/app/page.tsx, src/lib/groups.ts, groups/[id]/team/page.tsx·actions.ts. tests/team-management.test.mjs와package test목록 추가.
- 이번검증 lint/tsc성공, webpack build38경로성공, test:db93/93성공, diffcheck성공. 첫 신규테스트는 사진팀을other로바꾼뒤 담당교역자직책을 넣어 기존직책검증에 실패; 픽스처를 정상배정 후 분류변경순으로 수정하고 전체93개 재실행 성공. 운영DB25적용/앱배포/실제명단변경 미실행.
- 추가 사용자 제안: 관리자에게 파트·희망직책·사유를 전달하는 담당배정요청 및 문의하기 기능. 배정요청과일반문의 분리, 관리자 종알림·상태추적, 승인시에만실제권한반영 방향을 제안했으며 아직 미구현. 본인승격 우회나 자동승인 금지.


### 2026-10-22 보고서 서버 자동저장·기기 간 이어쓰기 (로컬)
- 사용자 요청: 모바일→PC 이어쓰기 자동저장, 팀원 추가 및 역할 지정. 팀 명단 추가/이름·담당역할파트수정은 직전 담당팀관리 변경에서 구현됨(보고권한과 별개).
- DB26 20261109000000_report_autosave.sql: report_drafts 작성자전용 SELECT RLS, 크기제한262144바이트, 본인미제출초안+can_edit_report 검사 RPC. payload는 별도비공개초안에만 저장하며 canonical보고/새친구/출결/기도/비공개메시지에 자동입력 부수효과없음. 보호자연락처 동의도 검사. report행잠금과 draft timestamp+기준report timestamp로 기기충돌 차단.
- save_report_from_draft는 원래invoker save_report의 RLS를 유지하고 초안version확인→실제저장→본인자동저장사본정리를 한트랜잭션 처리. 다른기기에서 이미제출된 보고를 오래된초안페이지가 다시draft로내리는 것도차단.
- reports/[id]/autosave-actions.ts·autosave-context.tsx 추가, form-parts.tsx 입력중단1.2초후자동저장, 저장상태·실패재시도·충돌안내·미저장페이지닫기경고, 저장중/충돌시제출차단. 모든기존일반보고유형 및팀회의공과양식은 서버초안으로복원. page.tsx에서작성자만snapshot조회/복원, actions.ts에버전있는실제저장RPC연결. 이미제출된보고 수정·주중기도회 간단폼은자동저장대상아님.
- tests/autosave.test.mjs 추가 및package test:db반영: 다른기기조회·stale version충돌·타인/최상단비공개초안격리·anon차단·동의검사·자동저장시새친구0명→실제저장시1명·저장후사본정리·제출후자동저장/오래된수동저장거부.
- 이번검증 전체test:db94/94성공, lint/tsc/webpack build38경로성공. 이후제출후오래된수동저장방지및hidden version조건추가후대상test1/1+lint+tsc재실행성공. diffcheck성공(LF안내만). 실제모바일/PC브라우저UI검증미실행. DB함수이전초안에서save_report를자동호출하면새친구중복문제가있어최종구현은별도초안저장으로설계교체했음.
- 운영DB25·26적용/배포/실제사용자데이터변경없음. 마지막확인운영5279e0a/DB24. 담당배정요청·문의하기는제안단계로미구현유지. 운영반영에는DB25·26과앱배포승인필요. 루트/셀케어다른도구수정보존.


### 2026-10-22 하단 작성/관리·전체 사역 대시보드·공유 예배위원·자동번역·모바일 정리 (로컬)
- 하단 메뉴 components/bottom-navigation·bottom-navigation-links 추가, 활성사용자 작성/관리(일반팀원은내보고서) 전환. /manage 신규: 관리자승인·그룹·예배·제출현황, 교역자담당명단, 최상단전체주간보고/예배별이슈 펼쳐보기 및이전주이동. 기존RLS와canManage/isClergy/isSenior 구분유지.
- 홈 공지·소통을 인사말보다위로 이동, 예배·팀이슈를 하단으로이동, 주중기도회/비공개메시지 두카드 중앙정렬. 기도회필드를 prayer-fields.tsx공통컴포넌트로분리하고모바일1열/큰화면2열, 입력최소폭과긴문장줄바꿈, 관리자탭줄바꿈, 하단메뉴안전영역/보고저장바간격반영.
- DB27 20261110000000_shared_worship_staff.sql: 예배종류+날짜별공유위원, 승인사용자전체읽기/교역자이상쓰기, 작성자불변/수정자자동기록, RLS강제. worship-staff/page·actions, shared-worship-staff컴포넌트추가. 기존보고service_staff원문보존/중복입력대신공유명단링크, 모든동일예배보고에공통패널표시.
- 셀케어 api/translate.js읽기참고, 셀케어수정없음. translation-provider 서버API+translation-actions의사용자RLS재조회+일반보고허용필드만전송. 최상단영어보기시보고/관리요약자동영어번역, 영어보고코멘트는한국어자동번역. 원문유지, 보호자/기도/비공개메시지는일반보고번역대상제외. ANTHROPIC_API_KEY·TRANSLATE_MODEL·TRANSLATION_ENABLED 설정필요(자리표시자만.env.example추가). 실제유료API전송안함, provider테스트는mock만사용.
- 모바일실측중 누락된postcss설정으로webpack에서Tailwind유틸리티가생성되지않음을발견. @tailwindcss/postcss(dev)추가, postcss.config.mjs, globals.css @source ../ 명시. 프로덕션CSS의flex/grid/text-center생성=true, raw @theme미잔존확인. npm설치가5high취약점안내를출력했으나자동force업그레이드는하지않음.
- 검증: test:db96/96성공(공유예배위원교역자쓰기·타팀읽기·일반관리자쓰기차단·작성자/수정자보호, 번역요청/실패/잘린응답/비공개필드제외포함), 최종lint/tsc성공, 최종webpack build40경로성공, diffcheck성공(LF안내만). 초기빌드는언어제네릭타입오류→수정, 임시미리보기삭제후남은생성타입1파일참조오류→해당생성파일정리후최종성공.
- 실제Chrome1에서개인정보없는공통PrayerFields 로컬fixture를320/390폭검증. 카드text-align:center/display:flex, 가로넘침없음(390폭page375,320폭page305스크롤바제외), 320폭하단스크롤후등록버튼bottom617<하단메뉴top675확인. 스크린샷 outputs/mobile-ui/prayer-390.png·prayer-320.png. 개발fixture원본outputs/mobile-ui/preview-page.tsx에보존, 앱의임시auth/ui-preview페이지는제거, 최종build에없음. viewport reset완료, 로컬dev서버종료.
- 운영반영/커밋·push/DB25~27적용/계정배정/실제번역API·메일·푸시전송없음. 현재운영5279e0a/DB24유지. 새기능은로컬검증상태이며운영반영승인필요. 문의·담당배정요청은이전제안단계미구현. 루트와셀케어타도구수정보존.


### 2026-10-22 일반 보고 교역자 기본 공개·부산 사역 소식 통합 (로컬)
- 사용자 최신 요청에 따라 제출/확인된 일반 보고는 모든 활성 교역자에게 기본 공개한다. DB28 20261111000000_clergy_default_report_read.sql에 SELECT 정책과 can_view_report/can_view_group 보강. 기존 직급/담당/본인/임시셋업 열람 예외 보존, 신규 교역자 기본 공유는 초안 제외. 기도제목·비공개 메시지·명단·수정/검토 권한 변경 없음.
- reports/[id]/sharing.tsx는 일반 보고 개별 공개 선택을 없애고 기본 공개 설명 및 기도제목·비공개 글 공개 설정으로 정리. 기존 report 공유 데이터는 삭제하지 않음.
- campus-form.tsx의 별도 사역 소식 묶음을 없애고 저장 키를 유지한 채 각 펼침 항목 안에 배치: 중고등부→교회학교, 청년부→청년부, 장년부/성도 섬김→장년부, 방문자→새가족 현황, 사역 방향/시설/기타→예배. 방문·헌금·경비는 별도 선택 항목 유지. report-forms.ts campusSectionRows를 입력 상태·제출 검증·읽기 화면(page.tsx)에 재사용해 기존/신규 원문을 부서별로 함께 표시. 빈 신규 sections라도 기존 사역 소식이 있으면 제출 가능.
- tests/clergy-default-read.test.mjs 및 package test 목록 추가. 이번 전체 test:db 98/98, lint, tsc --noEmit 통과. webpack build 40경로 통과. git diff --check 통과(LF/CRLF 안내만). 이번 변경 UI의 실제 로그인 브라우저 검증은 미실행.
- 배포/운영 DB 적용/실제 계정·보고 데이터 변경 없음. 운영은 5279e0a/DB24 유지. DB25~28 및 누적 앱 변경은 로컬 상태이며 운영 적용은 별도 승인 후 진행. 다른 도구·루트·셀케어 변경 보존.


### 2026-10-22 DB25~28 운영 적용 및 앱 배포 시작
- 사용자 신규 승인: DB25~28 적용과 앱 배포 진행. 운영 Supabase SQL Editor의 report 스키마에 단일 DO 배치 적용 성공, autosave_ready/worship_staff_ready/clergy_default_read_ready 모두true 확인. 사전 조회는 DB26~28 모두false. 배치 로컬 PGlite 실행도 true3개 확인. 증빙 outputs/report-deploy/db25-db28-applied.png.
- 앱 누적 변경은 직전 턴98/98·lint·tsc·webpack40경로 검증 완료 상태. 이번 배포 준비 중 코드 수정 없음. 번역 유료 API 환경 변수는 미설정 상태 유지, 실제 메일·번역·푸시 테스트 발송 없음. 이제 운영 master에 정상 push 후 Vercel Ready 확인 예정.


### 2026-10-22 누적 변경 운영 배포 완료
- 9a7a6de62f7998b71c7cb8f76f4ca81193ba7da6 정상 push: 5279e0a→9a7a6de origin master. Vercel 배포 7QrvoLnvoNDVkGCZrHC3fnMpj31R Production Ready/30초, tlc-weekly-report.vercel.app 도메인 연결 확인. 증빙 outputs/report-deploy/9a7a6de-production-ready.png.
- 운영 DB25~28 적용 완료(위 영수증 참조). 운영 사이트 실제 브라우저 접속 시 새 보고 내용 번역 언어 전환 버튼과 로그인 화면 정상 표시. 로그인된 사용자의 저장·자동저장·권한별 화면은 이번 운영 세션에서 직접 확인하지 않음. 직전 턴 98테스트/lint/tsc/build 성공 이후 코드 변경 없이 배포했고 이번에는 재실행하지 않음.
- 번역 API 환경 설정과 실제 번역 활성화, 주간메일 설정, 최상단 계정 지정은 별도 미완료 유지. 실제 메일·푸시 테스트 발송 없음. 이번 작업 종료 기록만 로컬 HANDOFF에 추가하며 문서 때문에 추가 운영 빌드를 만들지 않음.


### 2026-10-22 예배위원 보고서 내 입력·관리 메뉴 정리 (로컬)
- 사용자 정정: 별도 공유예배위원 카테고리가 아니라 같은 날짜·예배의 다른 팀 보고서에 먼저 작성한 예배위원이 표시되길 원함. components/shared-worship-staff.tsx는 별도 화면 이동 링크 대신 보고서 내 입력 폼으로 교체. report-worship-staff-editor.tsx, reports/[id]/worship-staff-actions.ts 신규. 교역자 이상 입력/활성사용자 읽기 기존 DB27 RLS 유지. 실제 날짜·예배는 RLS 열람 가능한 보고서에서 서버 조회, 클라이언트가 임의 예배 전달 불가. 저장 후 이동하지 않고 완료 문구 표시, updated_at 조건 갱신으로 타 화면 수정 덮어쓰기 방지.
- reports/[id]/page.tsx reportId전달, worship-form.tsx 중복 안내 수정. manage/page.tsx는 공지·소통/비공개 메시지를 상단으로 이동하고 독립 공유예배위원 링크 제거. 기존 /worship-staff 주소 및 DB자료는 삭제하지 않고 호환용 유지. 관리 메뉴에 대한 선택 질문에는 아직 응답이 없어 이 방향을 commentary로 명시하고 구현.
- 이번 검증 lint/tsc 성공, webpack build40경로 성공, 예배위원 권한 테스트1/1 및 타 팀 수정 후 stale timestamp UPDATE0건 검증 성공, diffcheck 성공(LF안내만). 전체98테스트 재실행은 하지 않음. 실사용 로그인 UI 검증 미실행.
- 운영은 9a7a6de/DB28 유지. 이번 수정은 로컬만, 추가 DB변경/운영배포 없음. 기존 사용자/문서 수정 보존.


### 2026-10-22 관리탭 소통메뉴 제외·공지 분류 (로컬)
- 사용자 응답으로 앞선 관리탭 방향 정정: 공유예배위원·비공개메시지·공지 모두 관리탭에서 제외. manage/page.tsx 링크 제거, 기존 제출현황/담당자·명단·주간요약 등 유지.
- notices/page.tsx에 전체 공지와 일부 공개 메시지 URL탭 추가. 전체는 target_group_id=null/audience=all인 분류 공지, 일부는 개별부서 또는 특정직급 공지로 서버 조회 단계에서 분리한 뒤 50건 제한. 전체 공지는 기존 대상분류 전체 구성원 기준임을 안내하며 교회 전체로 RLS범위를 넓히지 않음. 일부탭에 교역자 이상만 기존 minister_threads RLS로 허용된 대화 목록과 기존 메시지 보내기 화면 링크 표시. 새 메시지 권한/대상 기능을 만들거나 기존 비공개를 공개하지 않음.
- 이번 전체 test:db98/98, lint, tsc, webpack build40경로, diffcheck 성공. 초기 문자열 치환이 CRLF 때문에 누락되어 restricted변수 참조 타입오류 발생, 선언구간 수정 후 전부 재실행 성공. 실제 로그인 UI 미검증. DB변경·배포 없음. 운영9a7a6de/DB28 유지. 직전 보고서 내 예배위원 입력 수정도 로컬 유지.


### 2026-10-22 코멘트 명칭·교육부서 출생연도 표시 보완 (로컬)
- incident-feedback.tsx 제목을 사용자 요청대로 담임목사님, 담임사모님 코멘트로 변경. admin/users/[id]/page.tsx 역할 설명의 목회피드백은 보고서코멘트로 정리. 권한 변경 없음.
- groupDisplayName은 기존 GroupPicker/부서 상세에만 적용되어 홈 일부 목록·관리자 그룹목록·보고서 부서명에 출생연도가 빠짐. src/app/page.tsx, admin/groups/page.tsx, reports/[id]/page.tsx에도 기존 공통표시 적용. 기존 부서/출생연도 매핑과 중등·고등 분리 유지.
- 이번 lint, tsc --noEmit, diffcheck 성공. 문구/표시만 변경하여 DB테스트·build 재실행은 안 함(직전 공지탭 작업의98테스트/40경로빌드와 구분). 실제 로그인 UI 미검증. 배포/DB변경 없음, 운영9a7a6de/DB28 유지.


### 2026-10-22 담임목사님·담임사모님 보고서 열람 표시 (로컬)
- reports/[id]/page.tsx 제출/확인 보고서에 두 분의 독립 열람현황 표시. components/report-read-status.tsx는 실제 표시된 탭의 클라이언트 effect에서만 기록 요청(서버 render/prefetch는 기록 안함), role별 시각과 현 버전/이전버전 열람 구분. 기존 검토완료 상태와 분리. 보고서 updated_at이 바뀌면 이전 보고 열람·수정 후 미열람으로 표시, 다시 열면 갱신. 현재는 보고서 상세 화면 열람만 기록, 주간 요약에서 보는 것은 기록하지 않음.
- DB29 20261112000000_senior_report_reads.sql: report.senior_report_reads 역할별 PK, RLS 보고 열람자만SELECT/직접쓰기 차단. mark_senior_report_read는 활성 최상단 실제 role만 사용, report 행 공유잠금+버전일치 검사, 초안 차단, 같은 버전 재열람은 최초시각 유지. read-actions.ts 서버활성계정/최상단 재검증, 원문이나 비공개 데이터 전송 없음.
- tests/senior-reads.test.mjs, package test목록 추가: 역할별 기록·일반관리자/작성자/비활성 위조 차단·타인 기록 열람 차단·수정 버전충돌·초안차단 검증. 초기 fixture의 최상단 역할중복 및 Date객체 strict비교 오류 수정 후 성공. 이번 전체 test:db99/99, lint/tsc, webpack40경로, diffcheck 통과. 실제 최상단 로그인 UI 미검증.
- DB29 파일 작성만, 운영적용/배포/실제 열람기록 변경 없음. 운영9a7a6de/DB28 유지. 운영 반영 시 DB29 별도승인 및 선적용 필요. 이전 로컬 변경 모두 보존.


### 2026-10-22 보고 제출·교역자 수정 종 알림 (로컬)
- 원인: 기존 inbox DB트리거는 코멘트·답글만 처리, 일반 보고 제출/수정은 알림함 저장 경로 없음. DB30 20261113000000_report_lifecycle_inbox.sql에서 reports after insert/update 트리거 추가. 제출 시 활성 담당교역자(상위그룹 소속 상속 포함)+담임 두 분, 교역자가 타인 제출 보고 수정 시 작성자+담당교역자+두 분 대상으로 종 알림. 행동자 자신과 비활성계정 제외, 단독 기능관리자/무관교역자 제외.
- 임시저장/자동저장과 단순 검토상태 변경은 제외. 보고ID+트랜잭션+수신자 고유키로 같은 저장 중 다중UPDATE 중복 방지. 푸시 허용이 꺼져도 종 알림 저장, 실제 모바일 푸시 발송 연동은 이번 범위에 없음. 본문/기도/비공개메시지는 알림본문에 복사하지 않음. 기존 inbox 보고 RLS와 딥링크 유지.
- components/notification-bell.tsx 읽지않은알림 배지 추가. 활성화면 최초·60초 간격·창포커스·종열기 시 조회. 기존 읽음 처리 및 내용 바로가기 유지.
- tests/report-lifecycle-inbox.test.mjs 추가, package test목록 포함. 제출수신자3명/수정시작성자+두분/타인알림RLS/초안무알림/검토처리무알림/본문미노출 검증. 초기 fixture 직책누락 수정 후 전체test:db100/100, lint/tsc, webpack40경로, diffcheck 성공. 로그인 운영 종UI/실제푸시 검증 없음.
- 운영DB30 적용/앱배포/실제사용자 알림발송 없음. 운영9a7a6de/DB28 유지. 다음 운영배포에는 기존 로컬 DB29 및 이번DB30 별도승인·선적용 필요. 기존 작업과 사용자 변경 보존.


### 2026-10-22 채플 명칭·공통 모바일 메뉴 폭 점검 (로컬)
- 사용자 요청 학교예배→채플: group-display.ts meetingDisplayName로 기존 학교예배/학교 예배 저장명을 UI에서 채플로 표시. groups/[id] 모임선택·보고목록, reports 상세·목록, admin/submissions에 적용. 학교 보고양식/회의자료 제목은 채플·교육. 기존 DB예배종류ID/보고명 원문과 과거마이그레이션·seed는 변경하지 않음.
- 여러 메뉴 크기 문제 응답 반영: layout 상단 브랜드 flex-1/min-w-0·텍스트 줄바꿈·작은화면 글자크기, 종컨테이너 shrink-0, ui 공통 작은버튼 고정축소금지 대신 max-width·긴문구 줄바꿈, BackLink max폭, 알림긴제목/본문 줄바꿈. 학교·교육부서본문/설교자·부산날짜/경비는 모바일1열(sm이상2열), 부산선택버튼높이는 최소높이로 변경.
- 컴퓨터 브라우저로 개인정보없는 로컬 /auth/ui-preview 공통 PrayerFields·실제 상단브랜드·공통버튼·메뉴와 채플필드 fixture 320/390폭 실측: overflow0개, viewport320/page305 및390/page375(스크롤바제외). 증빙 outputs/mobile-ui/menus-320.png·menus-390.png, fixture원본 menus-preview-page.tsx 보존. 임시 앱페이지 제거, dev서버종료, viewport reset. 로그인된 종/모든 실사용 메뉴 개별 검증은 아님.
- 이번 lint/tsc 성공, 최종 webpack40경로빌드 성공, diffcheck성공. 임시페이지 삭제후 .next/dev/types/validator.ts가 남아 첫타입/빌드 실패했으나 해당생성파일정리후 tsc와build 재실행 성공. 문구/CSS만 바꿔 DB테스트는 이번에 재실행 안함(직전100/100과구분). DB/운영배포 없음, 운영9a7a6de/DB28 유지.


### 2026-10-22 홈 카드 시각 균형·빈 분류 선택 보완 (로컬)
- 사용자 스크린샷의 실제 문제 확인: 홈 비공개메시지 링크만 중앙정렬/min-height 누락, 회의자료1개가 고정2열 grid안에 남아 반폭 공백. page.tsx에서 기도회/메시지 동일80px최소높이·중앙정렬, 메시지는 공지 일부공개탭으로 연결, 회의자료는 한줄전체폭 아이콘+화살표 메뉴로 변경. 주간요약/담당명단 링크는 flex-wrap/gap으로 두문구간격 확보.
- group-picker.tsx는 전달받은 실제작성가능그룹이있는분류만 선택가능. 초기분류가 비어있거나 유효하지않으면 첫 유효분류로 표시, 소속없음은 select 대신 안내문. screenshot처럼 교육부서가 선택됐는데 배정된그룹없음인상태 방지. 기존 RLS/권한 변경 없음.
- 실제홈상단두카드 JSX 추출+실제 GroupPicker 사용한 개인정보없는 로컬fixture로320/390실측. 두카드높이80 동일/텍스트center/회의메뉴전체폭342.67(390뷰), 배정영상팀만있는fixture defaulteducation→예배기술자동선택 확인. 증빙 outputs/mobile-ui/home-cards-390.png, fixture원본home-cards-preview-page.tsx. 임시페이지제거/서버종료/viewport reset. 실제 로그인전체홈이 아닌 공통부품fixture 검증.
- 이번 lint/tsc, webpack40경로, diffcheck 성공. CSS·목록표시만수정하여 DB테스트이번재실행없음. 초기편집CRLF문자열불일치로스크립트중단(파일쓰기전), 줄바꿈무관한수정으로재실행완료. 운영배포/DB변경없음, 운영9a7a6de/DB28 유지. 이전로컬요청·DB29/30파일 보존.


### 2026-10-22 DB29·30 운영 적용 및 누적 UI 배포 시작
- 사용자 신규승인 DB29·30 적용과 앱 배포 진행. outputs/report-deploy/apply-db29-db30.sql 단일 DO 배치 로컬 PGlite 성공 후 운영 SQL Editor 적용 완료. 사전 db29_present/db30_present=false, 적용후 reads_ready/read_function_ready/report_notifications_ready=true3개. 증빙 outputs/report-deploy/db29-db30-applied.png.
- 보고서 내 예배위원 입력·공지분류·관리탭정리·코멘트명칭·연령표시·열람현황·종알림·채플표시·모바일메뉴 크기/정렬/빈분류 수정 누적반영 예정. 직전100테스트 검증 및 마지막 UI변경 lint/tsc/webpack40경로 통과 상태, 이번 배포 중 코드추가변경 없음. 실제 메일/푸시 테스트발송/유료번역API 호출 없음. 운영 master 정상push 후 Vercel Ready 확인 예정.


### 2026-10-22 열람·종알림·UI 누적 변경 운영 배포 완료
- 54d1c29116453ab6877baa6ef97f6a4e7c31e8c8 정상push: 9a7a6de→54d1c29 origin/master. Vercel 75fzyPWpiz6zreD2wRWP1sLE8osq Production Ready/43초, tlc-weekly-report.vercel.app 도메인 연결 확인. 증빙 outputs/report-deploy/54d1c29-production-ready.png. 운영 DB29·30 적용 완료(위 기록).
- 실제 브라우저 운영URL 로그인화면 정상 응답 확인. 로그인된 사용자로 보고작성/열람표시/종알림 실제운영기록 생성은 하지 않음. 이번 배포는 앞선100테스트 및 마지막UI lint/tsc/build40검증 이후 코드변경 없이 진행, 검증재실행 주장하지 않음. DB배치 PGlite 실행 성공은 이번 실행.
- 담당 최상단 계정 배정, 주간메일 설정, 유료번역 활성화 및 실제모바일푸시테스트는 별도미완료 유지. 이번 제출/수정 알림은 앱 종알림함이며 별도모바일푸시 연동은 없음. 운영현재54d1c29/DB30. 작업종료영수증은 로컬문서만갱신하고 문서때문에추가배포하지않음. 다른사용자/루트작업 보존.


### 2026-10-22 직접 확인·교역자 메시지·전체 코멘트 답글·조회 최적화 (로컬)
- DB31 20261114000000_confirmations_and_comment_replies.sql 신규. senior_report_confirmations/confirm_senior_report는 기존 자동열람과 별도 직접확인, 최상단 본인역할만/제출보고/버전일치 검사 재사용. 보고서마다 본인 확인했습니다 버튼과 역할별 확인완료/수정후재확인 표시. 자동열람만으로 직접확인 기록 생성 안함. 보고서 열람/확인 조회2개 병렬화.
- MinisterMessageComposer 공통서버컴포넌트 추가, 기존 messages와 공지 일부공개탭에 접히지않는 수신교역자선택/메시지폼 제공. 보고서에 최상단전용 메시지 바로가기. 기존 start_minister_thread RPC 비공개제한/작성권한 유지. 실제 메시지 전송·계정변경 없음.
- 운영 read-only SQL로 활성 recipient_role=pastor/pastor_wife 계정수가 모두0임을 확인. 기능이 안보이는 실제 권한원인으로 사용자에게 알림. 담임목사님 로그인 이메일 요청중, 담임사모님은 이전제공계정으로 역할지정안준비예정. 이메일은 문서에복사하지않음. 실제역할배정/승격은 미실행.
- DB31 prayer_comment_replies/notice_comment_replies RLS 및 답글알림트리거 추가. 기존 report/incident 답글에 더해 기도회·공지 코멘트마다 답글 UI 제공. 기존 부모열람범위 보존/작성자위조차단. 새로운 DB알림문구 목회피드백→피드백, 이전 저장알림도 loadNotifications의 표시제목만 정규화(원문저장값변경없음).
- 지연개선: feedback-replies.ts 일괄로드 helper로 댓글별 N조회→화면1조회, 댓글0개면조회0. report/incident/prayer/notice 부모에서 일괄로딩. getSessionProfile React cache로 동일서버요청 안에서만 인증조회공유(사용자간·요청간캐시없음). 20댓글→1조회 unit검증.
- 이번 전체 test:db102/102, 최종lint/tsc/webpack40경로/diffcheck 성공. 추가권한테스트 직접확인위조/버전/개별확인, 기도·공지답글범위/알림 포함. 초기스크립트 parse/CRLF누락과 Link import 오류 수정후재검증. 운영공개로그인 응답200 약385/323ms 측정(처음 sandbox fetch 실패후승인된읽기전용네트워크로재측정). 로그인후화면 실제개선율/전체체감속도는 미측정이며 개선완료로단정하지않음.
- 운영DB31적용/배포없음. 운영54d1c29/DB30유지. 이번코드는로컬검증상태, 최상단배정과운영DB31별도승인 필요. 실제유료번역/메일/푸시 전송없음. 사용자/다른작업보존.


### 2026-10-22 종→알림 목록·카드 전체 직접 이동 (로컬)
- 사용자 참고이미지에 맞춰 notification-bell.tsx를 /notifications 링크로 변경, 팝오버/관련내용보기링크 제거. notifications/page.tsx 서버RLS목록, notification-list.tsx 전체카드링크·새알림배지·KST날짜·새로고침·이동중표시 추가. 카드클릭 시 기존 read_notification RPC 호출후 해당딥링크 이동, 읽음실패라도 이동. ctrl/meta 새탭 동작유지, 목록의 보고서 prefetch는 비활성화해 불필요한50개화면조회 방지.
- notifications/actions.ts 목록조회 created_at 포함, loadUnreadNotificationCount는 head exact count로 종배지만갱신. 종60초/포커스조회 시 본문50개를 불러오던 비용제거. 기존 RLS/개인열람범위 유지, 새DB변경없음(이전로컬DB31은미적용유지).
- 이번 lint/tsc/diffcheck/webpack41경로빌드 성공. 처음 npx.ps1 실행정책오류로 독립tsc호출이막혔으나 npx.cmd로 재실행 성공. 실제로그인 UI/읽음→이동브라우저 조작 미검증, DB테스트이번재실행안함(직전102개와구분). 운영배포없음, 운영54d1c29/DB30.
- 담임목사님 계정은 아직 없다는 사용자 응답 확인. 담임사모님 최상단역할 지정은 아직미실행. 이번변경은기존소스/개인정보/사용자수정 보존하며 진행.


### 2026-10-22 DB31 운영 적용·직접확인/답글/알림목록 앱 배포 시작
- 사용자 신규승인 DB31 적용과 앱배포진행. outputs/report-deploy/apply-db31.sql 단일DO배치 PGlite 검증성공후 운영SQL실행. 사전3테이블false, 실행후 confirmations_ready/confirm_function_ready/prayer_replies_ready/notice_replies_ready 전부true. 증빙 outputs/report-deploy/db31-applied.png. 계정역할지정은승인범위에서명시제외/미실행.
- 누적기능(직접확인, 메시지폼, 기도/공지답글, 피드백문구, 인증/답글조회최적화, 알림목록카드전체이동) 운영master반영예정. 앞선102테스트와최종lint/tsc/webpack41경로 성공후 이번배포중코드변경없음. 이번에테스트전부재실행한것은아니며 DB배치실행검증만새로수행. 메일/푸시/유료번역 발송없음.


### 2026-10-22 DB31·직접확인/답글/알림목록 운영 배포 완료
- e810d0254c98a075ce2f501d3de5bea996fd91f0 정상push: 54d1c29→e810d02 origin/master. Vercel EH3xRRJWDWh7S8Fp4YSyD668cSvw Production Ready43초, 운영 tlc-weekly-report.vercel.app 연결확인. 증빙 outputs/report-deploy/e810d02-production-ready.png. 운영DB31 적용완료.
- 운영 /notifications 로그인없는브라우저접근 시 정상로그인화면으로이동 확인. 로그인된사용자의 카드읽음·이동/직접확인/답글은 운영실사용기록을남기는검증 미실행. 앞선102테스트·최종41경로빌드 통과상태로배포, 이번에는전체검증재실행없음. 이번DB31배치 PGlite 검증은 새로성공.
- 실제계정역할지정은 사용자승인범위에서제외되었으므로미실행, 최상단활성계정0이라는 직전조회이후 변경없음. 담임목사님 계정아직없음, 담임사모님 지정은별도남음. 직접확인/교역자메시지는최상단역할배정후표시됨을사용자에게안내. 실제메일/푸시/유료번역 발송없음. 운영현재e810d02/DB31. 종료기록은로컬문서만추가, 추가빌드트리거하지않음. 루트/사용자타작업보존.


### 2026-10-22 클릭·등록 즉시 진행상태 표시 (로컬)
- 사용자 불확실한클릭반응 개선. 현재Next16.4의 loading/useLinkStatus 로컬문서 확인. components/pending-link.tsx 공통Link는 실제 Next내비게이션 pending동안 화면을여는중 상태+스피너표시, 완료시자동해제. 기존NextLink import를 동일props wrapper로 app/components에서교체(외부/새탭/뒤로이동 기본Link동작유지). app/loading.tsx 새경로fallback, ui.Loading 스피너·설명·skeleton으로보강.
- SubmitButton 공통버튼 aria-busy/스피너보강. feedback-replies, incident-feedback, 보고서코멘트, prayer-meetings 등록/코멘트, messages답장에공통SubmitButton적용, 실제서버액션pending동안진행문구/disabled로중복방지. 이미보고서SubmitBar/직접확인/예배위원저장pending은그대로유지. notification-list 새로고침에useTransition진행상태추가.
- 개인정보없는개발전용 /auth/ui-preview와 /next fixture(3.5초지연)에서실제Chrome검증: 등록클릭직후 disabled버튼/status등록중, 완료후버튼복귀. Link클릭직후 status화면을여는중 표시, 목적화면표시후해제. 증빙 outputs/mobile-ui/action-saving.png·action-navigation.png. fixture원본 interaction-preview-page/interaction-next-page 보존, 임시앱페이지둘삭제/생성타입정리/dev서버종료. 지연fixture에서Next개발경고표시는있었으나실제상태전환확인, 최종앱빌드에fixture없음.
- 이번최종lint/tsc/webpack41경로/diffcheck성공. DB/권한변경없는UI작업이라DB테스트재실행없음. 실제운영지연시간개선율을측정한것아니며처리상태표시개선임. 운영배포없음, 운영e810d02/DB31유지. 담임계정역할지정미완료/사용자타작업보존.


### 2026-10-22 클릭 진행상태 앱 배포 시작
- 사용자 배포승인. 이번은 app/loading·pending-link·SubmitButton 진행표시 및 적용부만 변경, DB마이그레이션/계정변경 없음. 직전lint/tsc/webpack41경로와3.5초실브라우저대기상태테스트 통과 후 코드수정없이 배포. 운영master 정상push 및 VercelReady확인예정.


### 2026-10-22 클릭 진행상태 운영 배포 완료
- bcbc0e2bfc598dc795653c05f212b8c046b832be 정상push: e810d02→bcbc0e2 origin/master. Vercel ACozZuQ36ccppZdDbXj8cKViAu52 Production Ready42초, 운영도메인연결 확인. 증빙 outputs/report-deploy/bcbc0e2-production-ready.png. DB31유지/추가DB변경없음.
- 실제운영URL 브라우저접속에서 status화면을불러오고있습니다/잠시만기다려주세요 표시후 로그인화면완료 확인. 로그인후저장동작 운영기록생성테스트는없음. 직전로컬lint/tsc/41경로빌드와지연fixture검증후코드수정없이배포, 이번전체테스트재실행없음. 계정지정/실제메일/푸시/유료API전송없음. 운영현재bcbc0e2/DB31. 종료영수증로컬만추가/추가배포트리거안함/사용자타작업보존.


### 2026-10-22 부산 원래양식·재정필수·제출불가안내·코멘트수정 (로컬)
- 사용자6항목 요청. 원본 forms.gle 링크는 web도구접근실패, Chrome 실제구글폼을읽기전용으로열어 전체필드순서/필수여부 확인(제출없음). campus-form.tsx를 스탭→헌금→경비→토요일예배팀→원래사역소식 순서로복원. 출발날짜직접선택유지/판교라벨을분당으로변경, depart_pangyo 저장키는호환유지. 기존 sections기록은원문보존하며있을때만하단추가기록으로수정가능. 원래텍스트필수복원, 헌금/경비는0·없음도명시입력필수. report-forms missingOnSubmit과예전sections면제테스트2개를새요구사항에맞게갱신.
- DB32 20261115000000_report_workflow_and_comment_edits.sql: report그룹전체의주간해당없음+사유허용(원래can_write_group RLS/미래주차제한유지), 부산제출에헌금/5경비정수/숙소누락차단trigger. 기존보고데이터rewrite없음. groups/[id] 버튼은모든canWrite파트표시, 이번주모임및사역해당사항없음표현. 이기능은파트전체한주기준이며예배별/개인별면제는아님.
- 기술팀선택항목은기존에도필수가아님을확인. 말씀본문/내용·예배위원선택라벨표시, 이슈없음정상진행버튼은resultnormal+notes기본특이사항없습니다(기존notes보존). ReportForm은자동저장중/충돌때제출버튼을영구비활성으로보이지않게함: 실제전송pending만disabled, 자동저장진행중누르면완료후요청재실행, 충돌이면이유팝업. 실사용보고의기존충돌상태자체를재현한것은아님.
- components/form-validation FieldErrors/FieldHighlight/FailureDialog, ui.Field와Section/TextArea에공통연결. 필수누락팝업+빨간항목+확인후첫누락항목scroll. 네트워크/예외도원문노출없이실패팝업, 실패후자동저장중지상태복원. reports/actions.ts 부산재정DB오류를별도안내코드로매핑, servererror팝업추가.
- DB32 코멘트/답글8테이블은본인body만UPDATE허용, 기존넓은UPDATE권한회수후body컬럼만grant/부모열람RLS유지. notifications/edit-actions.ts와feedback-edit.tsx로본인수정폼·완료/오류상태. report/incident/prayer/notice/root/reply에적용. 보고서는제출후작성자도기본열람화면, 수정버튼으로전환. 코멘트는!editMode+제출후에만표시, 수정화면에열람/코멘트바로가기.
- tests/report-workflow.test.mjs 실제 autosave→save_report_from_draft 정상/빈선택항목제출·전팀해당없음·외부차단·부산재정필수·본인코멘트수정/작성자변조차단. 전체test:db103/103성공. 초기sections면제기대/불완전fixture오류와commentUPDATE기대오류수정, 넓은UPDATE회수검증후성공. 최종lint/tsc/webpack41경로성공, diffcheck의빈줄공백발견후제거.
- 실제Chrome3 로컬실제WorshipForm/CampusForm fixture로선택항목없이normal+특이사항없습니다 제출pending진입확인(가짜action, 운영제출아님), 부산미입력제출dialogopen=true/redFields19확인, 확인클릭후dialogclose·필드이동확인. 증빙 outputs/mobile-ui/report-validation.png, fixture원본report-workflow-preview.tsx. 임시페이지삭제/생성타입정리/dev서버종료. 최종네트워크예외처리추가는lint/tsc/build검증만, 실제오프라인재현은안함.
- 운영DB32적용/배포/실제계정·보고·알림변경없음. 운영bcbc0e2/DB31유지, 다음운영반영에는DB32별도승인·선적용필요. 기존사용자/루트/타도구수정보존.

### 2026-10-22 DB32 배포 준비 및 로그인 대기
- 사용자 앱 배포 요청. DB32 별도 승인 질문 제시, 아직 응답 대기. outputs/report-deploy/apply-db32.sql 전체 배치를 기존 마이그레이션+seed 환경의 PGlite로 실행하여 campus_finance_ready/comment_edit_ready/all_parts_no_meeting_ready 모두 true 확인.
- Chrome3 운영 SQL Editor 읽기 전용 사전조회 시 Session expired 표시. Sign in again 클릭 후에도 만료 모달 유지, 사용자 재로그인 필요. 운영 SQL 실행/DB32 적용/커밋/push/앱 배포는 아직 하지 않음. 운영 bcbc0e2/DB31 유지.
- 로컬 변경과 기존 사용자 수정 보존. 다음 단계는 DB32 승인 및 Supabase 재로그인 후 사전조회, DB 적용, 앱 커밋/push와 Vercel Ready 확인.

### 2026-10-22 DB32 승인 확인·운영 로그인 차단
- 사용자 DB32 적용과 앱 배포 명시 승인 수신. 동일 범위 재승인 불필요.
- Chrome3 운영 SQL Editor 만료 모달 닫기/새로고침 후에도 Session expired 재발. 사전조회조차 실행되지 않음. 사용자 Supabase 재로그인 필요. 증빙 outputs/report-deploy/db32-session-expired.png.
- 운영 DB32/앱 미반영, bcbc0e2/DB31 유지. 사용자 로그인 완료 후 승인된 DB32와 앱 배포 이어갈 것. 로컬 검증 결과와 변경 보존.

### 2026-10-22 부산 세부 양식 피드백·배포 전 이미지
- campus-form/report-forms 변경: 사역 방향을 첫 입력으로, 시설/섬김/기타를 마지막 3항목으로 분리. 장년/청년 중복 진행란 제거(기존 입력이 있으면 추가 기록으로 보존), 청년부 명칭/안내문 변경, 교회학교 영유아유치초등부 소식, 새가족 관련 보고와 방문자 관련 보고 분리, 새가족 교육 명칭 적용. 기존 texts/sections 저장 키와 원문 유지. 분당 출발/재정 필수/DB32 개선 유지.
- 열람·요약 campusSectionRows에도 상단 방향/하단3항목 분리 적용. 기존 원문 중복·누락 방지 테스트의 변경된 순서와 명칭 갱신. 이번 전체 DB103/103, lint, TypeScript 포함 webpack41경로 빌드, diffcheck 성공. 미리보기 임시페이지 제거 후 생성 validator 잔재 정리하여 빌드 성공.
- 실제 로컬 CampusForm 캡처 outputs/mobile-ui/busan-campus-top.png, busan-campus-departments.png, busan-campus-bottom.png. 운영 데이터 입력/전송 없음. 전체길이 캡처 타임아웃으로 3화면 분할. fixture원본 busan-preview-page.tsx 보존, dev서버 종료. 사용자 요청대로 이미지 먼저 제시, 배포 안함. DB32 승인 유지, Supabase 재로그인은 여전히 필요. 향후 중고등교사/새가족섬김이 폼 연동은 미구현 요청사항.

### 2026-10-22 부산 제목·중복 박스 후속 수정
- campus-form.tsx 첫 항목 제목 ‘교회 전체적인 사역 중점 사항 및 방향’과 필수 표시 유지, 안내 placeholder를 사용자 원문 ‘이번주 다녀오면서 전체적으로 케어했던 방향이나 중점 사안을 적어주세요’로 수정. 교회학교 소식 제목 ‘영 · 유아 · 유치 · 초등소식’ 적용.
- 방향 및 마지막 시설/섬김/기타 단일 입력 항목은 Section+Card 중첩을 제거하고 TextArea의 제목/입력란 하나로 표시. 저장 키와 필수 검증 유지.
- 이번 lint/tsc/diffcheck 통과. DB/운영 배포 없음, 직전 이미지에는 이번 후속 변경 미포함. DB32 승인과 Supabase 로그인 대기 상태 유지.

### 2026-10-22 DB32 운영 적용·앱 배포 시작
- 사용자 기존 DB32 승인과 최신 배포 요청으로 진행. Supabase 재연결 성공, 사전 db32_present=false 후 승인된 apply-db32.sql 실행. campus_finance_ready/comment_edit_ready/all_parts_no_meeting_ready 모두 true 확인, outputs/report-deploy/db32-applied.png 증빙. 계정 역할 변경/메일 전송 없음.
- 최신 부산 단일 제목 수정 포함 webpack41경로 빌드 성공. 직전 전체DB103/103 및 최신lint/tsc 성공 유지. 이제 앱 master 정상push 및 Vercel Ready 확인 예정.

### 2026-10-22 부산·제출안내·코멘트 수정 운영 배포 완료
- c1138085003d86e72286f5b9fc01627ab8bc7cc2 정상push bcbc0e2→c113808 origin/master. Vercel 2XmuWA3VsH2pnK4EkDMmeJejRPC8 Production Ready31초, tlc-weekly-report.vercel.app 도메인 연결 확인. 증빙 outputs/report-deploy/c113808-production-ready.png. 운영 DB32 적용 완료.
- 실제 운영 URL 로그인 화면 정상 응답 확인. 로그인 후 실제 보고 제출/수정과 알림 생성은 미실행. 최신 빌드41경로 이번 성공, 전체DB103/103 및 lint/tsc는 직전 실행 결과와 구분. 계정 역할 변경/메일·푸시 전송 없음. 운영 현재 c113808/DB32. 배포 완료 영수증은 로컬 문서만 갱신, 추가배포 트리거 안함. 사용자 루트 변경 보존.

### 2026-10-22 예배위원 별도 메뉴 분리 (로컬)
- 사용자 동의로 홈에 /worship-staff 예배위원 메뉴 추가. 기존 날짜·예배별 명단 등록 화면 재사용, 제목 예배위원/홈 돌아가기, 보고서 링크에서 해당 예배 앵커 이동. 기존 교역자 입력·승인사용자 열람 RLS 유지.
- shared-worship-staff는 보고서 안 편집기를 제거하고 공유 명단 열람+날짜/예배 메뉴 링크만 표시. worship-form 안내 변경, 기존 보고의 service_staff 원문 보존. 저장·제출 로직 및 DB 변경 없음.
- 이번 lint/tsc/webpack41경로빌드/diffcheck 성공. 초기 Card id 타입오류는 앵커용 div 래핑으로 해결. 운영로그인 실데이터 UI 확인과 DB테스트 재실행 없음(UI만 변경). 배포 미진행, 운영 c113808/DB32 유지. 기존 사용자 변경 보존.

### 2026-10-22 예배위원 항목·예배인도자 및 앱 배포 시작
- 사용자 배포 요청 후 추가 요구 반영. 별도 /worship-staff에 안내위원/헌금위원/말씀봉독 입력란, 기존 자유명단은 그 외 예배위원·기존 기록으로 보존. 저장은 기존 staff 텍스트/RLS 사용. 예배팀 보고서에 예배인도자 선택입력 worship_leader 추가, 열람/회의요약 표시. 기술팀 제출 필수항목 추가 없음.
- 수정파일 src/app/page.tsx, reports/[id] page/worship-form, worship-staff/page, components shared-worship-staff/worship-staff-fields/meeting-summary, lib/report-forms. DB 변경 없음(DB32유지). 이번 lint/타입포함webpack41경로/test:db103/103/diffcheck 성공. 초기 SubmitButton import 오류 수정 후 성공. 운영 실데이터 작성테스트 없음. 승인된 앱 배포 정상push 예정.

### 2026-10-22 예배위원·예배인도자 운영 배포 완료
- 1223c0c3733564988dabf5906e276b0ba90bf4de 정상push c113808→1223c0c origin/master. Vercel DjgTToZGaxhsyptsf88UYH4N5eU7 Production Ready30초와 운영도메인 연결 확인. 증빙 outputs/report-deploy/1223c0c-production-ready.png.
- 운영 /worship-staff 비로그인 접근에서 로그인 화면 정상 확인. 실명단 저장/보고 제출/로그인사용자 화면검증은 하지 않음. 이번 DB103/103, lint, 타입포함빌드41경로 통과. DB32유지/운영DB변경 없음. 운영 현재1223c0c, 영수증 로컬문서만 추가. 사용자 루트 변경 보존.

### 2026-10-22 팀 이슈 기타 보고 (로컬)
- incidents/new가 보고서 선택으로만 안내하던 흐름을 담당 예배·기술팀의 독립 이슈 작성 폼으로 변경. 기존 report 쿼리 연결은 보고서 팀이슈로 리다이렉트 유지. IncidentForm에 예배·모임/기타 보고 선택, 기타는 service_id null + service_name 기타 보고로 기존 스키마 저장, 발생 날짜·팀 필수 유지. 연결된 보고의 이슈는 원래 예배/날짜 유지.
- 수정 src/app/incidents/new/page.tsx, incident-form.tsx, actions.ts. DB/RLS 변경 없음. 이번 lint/tsc/webpack41경로/test:db103/103/diffcheck 통과. 운영 UI 실제 이슈 생성 검증은 미실행. 배포 미진행, 운영1223c0c/DB32 유지. 기존 사용자 수정 보존.

### 2026-10-22 기타 팀 이슈 배포 시작
- 사용자 앱 배포 승인. 직전 lint/tsc/webpack41경로/DB103개 통과 후 코드 추가수정 없이 배포. DB변경 없음. 운영 master 정상push 및 Vercel Ready 확인 예정.

### 2026-10-22 기타 팀 이슈 운영 배포 완료
- dd17260b67d04e1419d4fd701ff53a9bee59b21b 정상push 1223c0c→dd17260 origin/master. Vercel 9tCpTVbgVi4rg2Ei692Us97Xd54w Production Ready23초, 운영도메인 연결 확인. 증빙 outputs/report-deploy/dd17260-production-ready.png.
- 운영 incidents/new 비로그인 접근시 로그인화면 정상 확인. 실사용 이슈 생성/알림 발송 없음. 직전103테스트/lint/tsc/41경로빌드 이후 코드변경없이배포, 이번 재실행 주장안함. DB32유지, 현재운영dd17260. 완료영수증 로컬문서만 갱신, 사용자변경보존.

### 2026-10-22 교회학교 명칭·출생연도 자동 표시 (로컬)
- 교육부서 UI 문구를 교회학교로 변경. group-display.ts 고정출생연도를 한국 현재연도 기준 offset 계산으로 변경(2026범위 유지, 매년+1), 이미 붙은 연도는 제거후 재계산. groups.ts label도 표시함수 사용, 저장용 canonical name과 관리자 이름입력은 원문유지.
- 홈/제출현황/그룹목록·상세/팀관리/출결·명단/보고서·부모부서/회의·주간요약·메일/공지대상/이슈팀 표시에 공통함수 적용. DB변경없음.
- 이번 lint/tsc, webpack41경로빌드 통과, DB104/104(연도이동·중복방지추가) 통과. Node직접import의 extensionless오류는 tests/weekly-summary-module.mjs 변환로더로수정. 마지막2개표시후lint/tsc/diffcheck성공, 빌드전체재실행없음.
- 실제 GroupPicker fixture Chrome2 확인/이미지 outputs/mobile-ui/church-school-birth-years.png. fixture는동적Date를사용한정적미리보기여서개발prerender경고가발생했으나실제production41경로빌드정상. fixture삭제/생성validator정리/dev종료, 원본church-school-preview.tsx보존. 운영로그인UI검증/DB적용/배포없음, 운영dd17260/DB32유지. 다음배포사용자승인필요. 사용자변경보존.

### 2026-10-23 기술팀 명단 간소화·로테이션·예배별 날짜 (로컬)
- members 목록/상세와 MemberCards를 worship 분기: 이름·상태·팀원구분·후속메모 중심, 학생/교사수 대신 팀원수, 생일/사진/학년/반/보호자 편집과 기술팀반등록 숨김. 기존 보관정보는 기술팀수정시 제외하여 보존. TeamMemberFields 공통폼 추가. 교회학교양식은 유지.
- DB33 20261116000000_team_member_positions.sql 새 report.members.team_position 컬럼·100자제약, 기존RLS유지. MEMBER_COLUMNS와 bulk/update 반영. tests/report-workflow에서 담당교역자등록과무관교역자수정차단검증추가. 운영적용미실행/별도승인필요.
- worship payload rotation 선택필드·입력·열람·회의/주간요약 표시. worship-staff 각서비스카드 GET 날짜선택(다른카드선택보존), 선택서비스/날짜별명단조회·저장/앵커복귀. 미래날짜제한유지. 기존전역date링크호환.
- 이번 lint/tsc/webpack41경로/DB104개/diffcheck 통과. 초기 JSX·import타입오류수정후성공. 실제컴포넌트fixture 이미지 outputs/mobile-ui/team-roster-simplified.png, service-dates-per-card.png, 원본team-roster-preview.tsx보존. 운영실명단/보고서/알림변경없음. fixture삭제/생성validator정리/dev종료. 날짜카드이미지는컴포넌트예시이며운영GET조회검증은미실행.
- 앞선 교회학교명칭/출생연도자동표시 미배포변경 함께보존. 현재운영dd17260/DB32 유지. 사용자가붙인셀케어public스키마SQL은이번업무대상아니므로수정/실행하지않음. 루트사용자변경보존.

### 2026-10-23 DB33·앱 배포 승인 및 연결 대기
- 사용자 DB33 적용과 앱 배포 명시승인 수신. 동일범위재승인불필요. outputs/report-deploy/apply-db33.sql 단일DO배치 작성, DB32까지 로컬PGlite+seed에 실행하여 team_position_ready/roster_rls_enabled 모두true 확인.
- 현재연결Chrome1에서 Supabase sql/new 신규탭 navigate가2회CDP timeout, 탭은about:blank유지. 로그인완료여부 확인못함. 사용자가같은Chrome에서Supabase/Vercel열고로그인해줄것요청. 운영DB/commit/push/배포아직없음, 운영dd17260/DB32유지. 로컬기능/검증결과보존.

### 2026-10-23 부산 실제 출발일과 보고 주차 분리 (로컬)
- 사용자 이전주포함출발일전부선택요청. groups/[id]/page의campus 출발입력 min/max 제거한 CampusDepartureField추가. createReport는실제그룹campus+standard+meetingcampus일때만 meeting_date=선택reportWeek, details.depart_pangyo=입력출발일로분리. 과거주출발일/미래출발일모두허용, 보고주차미래제한및다른모임날짜제한유지. campus-form의두출발일은이미min/max없어유지.
- 이번 lint/tsc/webpack41경로성공, test:db104개성공(실제저장2020/2099출발일왕복검증추가), diffcheck통과. 브라우저localhost navigate2경로timeout으로실제스크린샷불가. outputs/mobile-ui/campus-departure-change.png는명시된변경안내그림(화면캡처아님), preview원본보존/임시페이지삭제/생성validator정리/dev종료.
- DB추가변경없음. 앞서승인DB33/앱배포는연결대기중, 운영dd17260/DB32유지. 이번부산변경포함로컬수정보존, 운영반영없음. 다음연결복구후배포가능.

### 2026-10-23 사역 내용·팀 이슈 구분 및 작성자 위계 (로컬)
- WeeklyReportBlock 공통컴포넌트 추가, weekly-summary와manage 전체보고를 예배별 사역내용·특이사항/팀이슈 두구역으로분리. 팀명·이슈제목강조, 작성자작은연한글자, 직책연한알약, 본문들여쓰기/원문코멘트링크유지. 기존 report_issues는팀이슈구역으로이동해일반본문중복제거, 결과뱃지중복텍스트제거. 비공개내용추가안함.
- weekly-summary-data 일반보고author_id·이슈author/profile/연결report_id조회, 이슈작성자이름표시, 동일작성자연결보고직책우선·읽을수있는현재membership직책보조(없으면미표시). RLS변경없음. weekly-summary타입선택필드확장. 메일HTML변경은없음.
- 이번 lint/타입포함webpack41경로/DB104개/diffcheck통과. 초기스크립트중복const오류는수정후적용. Chrome2다시연결됨, 실제컴포넌트익명fixture캡처 outputs/mobile-ui/weekly-summary-separated.png. 원본weekly-summary-preview.tsx보존, fixture삭제/생성validator정리/dev종료. 실운영데이터/계정/알림수정없음, 실제운영조회는미검증.
- 새DB마이그레이션없음, 앞선승인DB33및앱은아직미배포. 운영dd17260/DB32유지. 다른로컬수정/사용자루트변경보존. 다음운영반영시DB33선적용필요.

### 2026-10-23 사역 보고 단일 입력·확인조치 표시 (로컬)
- 예배기술 WorshipForm은 notes 한곳에 사역/문제/조치작성, ReportAttentionFields 확인·조치필요 체크와 open/temporary/resolved 선택. JSON details.needs_attention/attention_status 선택필드 추가, 체크시사역내용필수. 기존 reports RLS/저장RPC/자동저장/보고코멘트·답글사용, 이슈복사레코드생성없음.
- reports열람에상태표시, 신규별도팀이슈입력제거; 기존incident코멘트/수정기록은 열람시 이전등록이슈로보존. 신규incidents/new는사역보고작성파트선택으로연결, 그룹custom명칭 기타보고·행사로확대. incidents목록은체크된제출보고와원문링크+과거이슈보존, 상태필터/열람RLS유지. home/manage메뉴 확인·조치목록. WeeklyReportBlock별도팀이슈구역제거·사역본문한번+배지, weekly-summary필터 확인조치필요보고만, MeetingSummary미해결표시보고원문링크목록추가.
- 수정 report-forms, reports/[id]/page/worship-form, team-issues, weekly-report-block, weekly-summary/page, meeting-summary, incidents/page/new, groups/[id]/new-report-fields, home/manage, tests/report-workflow. DB추가마이그레이션없음. DB104/104(autosave→제출flag보존+incident중복생성0검증), lint/타입포함webpack41경로빌드통과.
- 실제Chrome1 익명실제컴포넌트preview에서체크해제/처리상태변경→배지동작확인. outputs/mobile-ui/unified-ministry-report.png 캡처(입력/열람예시), 원본unified-report-preview.tsx보존. fixture삭제/생성validator정리/dev종료. 운영사용자실제제출/댓글/알림검증없음. 기존미배포교회학교·팀원명단DB33·부산출발일·요약변경보존, DB33승인있으나아직미적용. 운영dd17260/DB32유지, 이번작업배포없음.

### 2026-10-23 DB33 운영 적용·누적 앱 배포 시작
- 기존사용자DB33승인과최신배포요청에따라진행. 연결Chrome1 복구, SQL편집기읽기사전db33_present=false 확인후승인apply-db33.sql전체실행. team_position_ready/roster_rls_enabled 모두true. 증빙outputs/report-deploy/db33-applied.png. 다른스키마/계정역할변경없음.
- 교회학교표시/팀명단/로테이션/예배별날짜/부산출발일/단일사역보고·조치목록 누적로컬변경모두이번배포범위. 직전104테스트및lint/타입포함41경로빌드통과이후코드변경없음. 운영master정상push와VercelReady확인예정.

### 2026-10-23 통합사역보고·누적개선 운영배포 완료
- 8fc38f1d17eb7fcaf3dddef042941eea01c522eb 정상push dd17260→8fc38f1 origin/master. Vercel관리화면로그인필요로GitHub연결get_commit_combined_status조회, Vercel state=success/target Gx27kUUk6CYNyJKJ8ZSp9NLYyjWQ 확인. 운영DB33적용완료(직전증빙).
- 실제운영 /login 정상응답및변경문구 교회학교·예배팀·캠퍼스보고 확인. 증빙 outputs/report-deploy/8fc38f1-production-login.png. 실제로그인보고제출/처리상태/명단수정/알림은미실행. 직전104테스트/lint/타입포함41경로빌드후코드변경없이배포, 이번전검사재실행주장안함.
- 운영현재8fc38f1/DB33. 계정역할변경/메일·푸시전송없음. 완료영수증로컬문서만추가/추가배포트리거안함. 사용자루트/다른프로젝트변경보존. GitHub연결조회에서첫ref파라미터불일치는commit_sha로교정후성공, 인증토큰접근없음.

### 2026-10-23 한영번역·번안 진단
- 사용자 작동안됨 확인요청. 코드상 LanguageSwitch는 메뉴번역아닌보고내용번역언어로컬선택, AutoTranslation/report액션은영어보고번역을isSenior에만허용. 일반교역자/관리자는보고서영문번역UI미표시. 영어report_comments의한국어번역만일반사용자대상으로연결, 나머지코멘트종류/답글/독립이슈번역없음. 별도번안모드없음, 공급자지침은faithful번역/자연스러운영어.
- ANTHROPIC_API_KEY/TRANSLATE_MODEL/TRANSLATION_ENABLED=true 모두필요. 최종HANDOFF에운영미설정기록유지. Vercel환경변수페이지접근은로그인화면이라현재운영값재확인불가(값추출안함). 실제유료API/운영본문전송안함.
- 이번 node --test tests/translation-provider.test.mjs 1/1성공(mock요청/오류/잘린응답/비공개필드제외), 실제API연결성공을뜻하지않음. 코드/권한/설정/DB/배포변경없음. 운영8fc38f1/DB33유지. 후속: 운영로그인후설정존재확인, 번역가능역할·화면범위결정및활성화필요.

### 2026-10-23 운영 번역 환경 확인 완료
- 사용자 연결복구 후 Chrome1 Vercel tlc-weekly-report 프로젝트 환경변수 목록 읽기 확인. 기존환경변수7개만있고 ANTHROPIC_API_KEY/TRANSLATE_MODEL/TRANSLATION_ENABLED 세항목없음. 비밀값펼치기/복사/기록안함. 운영번역실행불가원인확정.
- 셀케어 api/translate.js 읽기비교: 동일Anthropic공급자사용, 자체프로젝트환경키필요. 셀케어프로젝트의키읽기/재사용안함. API모델명은공식Claude문서조회(claude-sonnet-5-5)로확인, 실제API호출없음.
- 코드/설정/권한/DB/배포변경없음. 다음필요작업: 보고서프로젝트에사용자가키직접등록, 모델/활성화설정변경안확인, 번역사용역할범위확정. 현재영문보고번역최상단제한/메뉴번역아님/번안별도없음 진단유지. 운영8fc38f1/DB33유지.

### 2026-10-23 사용자 번역 설정 등록·재배포 확인
- 사용자완료응답후Vercel프로젝트환경목록에 ANTHROPIC_API_KEY/TRANSLATE_MODEL/TRANSLATION_ENABLED 세변수Production등록확인. 비밀값펼침/복사없음, 값자체유효성미확인.
- 사용자가이미재배포한9Rar569UnnrDSnRRj1M5yn8xhBgY(8fc38f1동일소스) Production Current Ready52초와운영도메인연결확인. 중복재배포실행안함. 증빙outputs/report-deploy/translation-env-production-ready.png.
- 에이전트코드/환경/DB/계정변경없음. 영어보고번역최상단전용유지. 실제권한최상단로그인/API본문번역실행미검증(예시문장API테스트도실행안함), 실제보고내용외부전송없음. API키/모델/잔액의실효성은담임계정실제번역으로확인필요. 이번단순운영확인으로테스트재실행없음. 운영8fc38f1/DB33.

### 2026-10-23 이메일 발신 표시 이름 확인
- 사용자 문의에 따라 읽기 확인만 수행. 셀케어 요약 메일은 cell-care/api/_digest.js의 from.name='TLC 셀 케어', 보고 앱 요약은 src/lib/weekly-email.ts의 'TLC 교회 보고서'. 로그인 메일 표시 이름은 공유 Supabase Auth Custom SMTP Sender name에서 설정한다.
- TLC Office 변경 방법 안내 예정. 공유 Auth 설정 변경 시 두 앱 로그인 메일에 함께 영향. 코드·SMTP 설정·DB·배포 변경 없음, 테스트 실행 없음. 실제 받은 메일 종류는 미확인.

### 2026-10-23 알림 미수신 초기 확인
- 사용자 알림 미수신 문의. 종 알림/이메일 중 어떤 종류인지 비동기 질문, 아직 미확인. 앱과 발생 동작·수신 계정 역할도 필요.
- 읽기 확인: 셀케어 notify-submit은 submit_push_targets 결과가 0이면 바로 종료하고 sendAll의 알림함 기록도 기기 endpoint 대상으로 구성한다. 기기 등록 여부에 따라 일부 알림이 누락될 가능성 있으나 운영 원인으로 확정하지 않음. 보고 앱은 별도 inbox_notifications를 읽는다.
- 코드·DB·설정·운영 데이터 변경, 알림 발송, 배포·테스트 실행 없음. 종류 확인 후 해당 경로 조사 필요.

### 2026-10-23 두 앱 휴대폰 푸시 범위 확인
- 사용자가 셀케어·교회보고서 모두 푸시 미수신이라고 명확히 함. 두 앱의 기기 등록·테스트 발송 코드를 읽음. 별도 사이트 구독이며 각 앱에서 등록 필요. 교회보고서 보고 제출/수정 알림은 DB inbox 생성만 연결되어 있으며 기존 공지·신청·리마인더의 웹푸시 발송과 별도임.
- 셀케어는 제출 API→수신 기기 조회→sendAll 푸시 경로 존재. 미수신 원인은 운영 기기 등록/서버 발송 결과 미확인으로 확정하지 않음. 두 앱 테스트 알림 결과 문구와 휴대폰 종류를 질문함.
- 코드·설정·DB·배포 변경 및 실제 푸시 전송 없음. 테스트 실행 없음. 다음 작업: 테스트 결과로 구독/키/기기 차단 분리, 교회보고서 보고 이벤트 푸시 연결 구현 검토.

### 2026-10-23 테스트 알림 문구 해석 정정
- 사용자가 교회보고서 테스트 버튼 후 같은 문구가 나온다고 재확인. settings/actions.ts 실제 payload.body가 정확히 '이 기기에서 알림을 받을 수 있습니다.'임을 확인. 앞서 이를 단순 지원 안내라고 설명한 것은 잘못이므로 사용자에게 정정한다.
- sendToSubscriptions는 OS 발송 전 동일 본문을 앱 알림함에 기록한다. 해당 문구만으로는 OS 푸시 성공/실패 판정 불가. 아이폰 알림 배너에서 보이면 테스트 푸시 수신, 앱 내부에서만 보이면 알림함 생성만 확인된 것. 보고서 제출/수정은 종 알림만 연결되어 있다는 기존 진단 유지.
- 이번 읽기 확인 및 문서 기록만 수행, 코드·운영 변경/발송/테스트 없음.

### 2026-10-23 모임 3시간 미제출 푸시·금요일 17시 요약 연결 보완 (로컬)
- 사용자 요청: 종료 3시간 내 미작성 시 예배명 포함 작성 요청, 금요일17시 두 분 요약본. 기존 claim_meeting_reminders SQL와 GitHub5분 workflow 존재 확인. REPORT_MEETING_REMINDERS_ENABLED/REPORT_CRON_SECRET 활성화 및 운영 실행 이력은 미확인. Vercel cron만 보고 스케줄이 없다고 한 초기 설명 정정.
- src/lib/meeting-reminders.ts 푸시 제목을 '[모임명] 보고서 작성 부탁드립니다'로 변경. src/app/api/cron/[slot]/route.ts 금요일 fri-digest non-dryRun에서 runWeeklyEmail 호출 추가, 기존 주간 DB claim으로 모임 경로와 중복 방지. docs/SETUP.md 운영 설정·2시간 재알림·과거 누락분 주의·실행 지연 기록.
- 이번 lint, tsc --noEmit, webpack production41경로, test:db104/104 통과. DB 및 권한 변경 없음, 화면 UI 변경 없음. 실제 푸시/이메일 전송·운영 설정/역할 변경·배포 없음. 운영 활성화 전 등록 종료시각과 과거 미제출 대상·담임 역할·메일 설정 확인 필요. 신규 운영 설정/배포 승인은 아직 받지 않음. 셀케어 소스 보존.

### 2026-10-23 제출 푸시 추가·자동 알림 운영 확인
- 사용자가 배포 중 제출 알림도 두 분·담당 교역자에게 휴대폰 푸시 요청. report-submission-push.ts 추가, saveReport 성공 후 next/server after로 DB 종 알림의 신규 report_event_key 수신자에게 전달. 활성/notify_enabled 확인, notification_logs notice ID claim으로 중복 방지, sendToSubscriptions 빈 recipients로 종 알림 중복 생성 금지. 본문 읽기 없음. 제출을 푸시 실패로 취소하지 않으며 자동 재전송 큐는 아님.
- 이번 제출 푸시 mock1/1, DB104/104, lint/tsc/webpack41경로 통과. 이후 meeting-reminders claim 오류에 개인정보 없는 error.code 로그 추가. 운영 DB 변경 없음.
- b357f7b5b704ac57dbe97d3cead2b28aaaa799e0 이미 master push 및 Vercel BjqWMvCmZnc39CzkA5TiK4jv9T8S Production Current Ready24초 확인. 신규 제출 푸시는 추가 배포 예정.
- 운영 읽기 확인: GitHub REPORT_MEETING_REMINDERS_ENABLED=true 이미 설정. 최근10회 자동 실행 실패, #10 HTTP500(39902467250/job/120246892014), 원인 상세 미확정. Vercel 푸시·CRON 키 이름 존재, 주간메일 WEEKLY_EMAIL_ENABLED/GMAIL_USER/GMAIL_APP_PASSWORD 없음. Supabase SELECT reminder_function=true/reminder_schedules=true, 활성 recipient_role 수신자0. 계정 역할/비밀값/설정 변경 안함. 두 분 실제 수신은 계정 역할 등록 전 불가. DB 함수 적용 누락은 아님.

### 2026-10-28 교회보고서 피드백 1차 (로컬, DB 변경 없음)
- 명단 경로 통일: 교회학교는 관리 > 담당 팀 명단이 출결 명단(members)으로 연결되고 /groups/[id]/team은 members로 이동. team_directory에만 있던 이름은 명단 등록 칸에 미리 채워 안내(운영 데이터 자동 이전 없음).
- 확인·조치 목록에 예배·모임 이름 표시(service_types/group_meeting_types 조인). 중등부 13~15세·고등부 16~18세로 년생 분리.
- 보고 자동저장 타이머 제거, 임시저장 버튼으로만 저장(버전 충돌 확인 유지, 미저장 안내·이탈 경고). 안내 문구·guide.html 수정. autosave-actions.ts는 미사용으로 남김.
- 교회학교 양식에 설교 요약(details.sermon_summary) 추가, 공과·활동과 분리. 열람·주간 요약·회의 자료 라벨 반영.
- lint·tsc·test:db 108/108·next build 통과. 화면 실사용 확인·배포 안 함. 고등부 운영 DB 존재 여부 미확인.

### 2026-10-28 교회보고서 피드백 2차 (로컬, 운영 미적용)
- DB34 `20261117000000_member_school_status.sql`: members.school(50자) 추가, person_status에 long_absent·long_visitor 추가. 화면은 출생연도 칸을 학교로 교체(birth_year는 생년월일이 있을 때만 갱신, 기존 값 보존), 명단·출결에 장기 결석자·장기 방문자 묶음 표시. 재적 수(enrolled_snapshot)는 기존대로 active·newcomer만.
- DB35 `20261118000000_communion_groups.sql`: 성찬팀→'성찬 준비팀' 이름 변경(ID·보고 유지), '성찬위원' 파트 신설과 예배 연결. 활성 성찬준비팀이 이미 있으면 예외로 중단. seed도 새 이름으로 변경. 담당자(성수 사모님·요청자) 지정은 관리 화면에서.
- 운영 DB 조회는 브라우저 접근이 권한 판단에서 막혀 못 함. 적용 전 `scripts/check-db34-db38.sql`(읽기 전용)로 고등부·성찬·예배위원·PD 파트와 사진 버킷 상태 확인 필요.
- tests/feedback-round2.test.mjs 3개 추가, rls 기대값 갱신. lint·tsc·test:db 111/111·next build 통과. 배포 안 함.

### 2026-10-28 교회보고서 피드백 3차 일부: 예배위원 보고서·PD·기타 교역자·부서 멘션 (로컬, 운영 미적용)
- DB36 `20261119000000_worship_staff_group.sql`: 예배/기술팀 아래 '예배위원' 파트와 예배 연결. 예배위원 보고서 화면 위쪽 '예배위원 담당자' 카드에서 공유 worship_staff 명단을 바로 저장(saveStaffFromStaffReport). 보고 양식은 말씀·로테이션을 빼고 사역 내용·이슈·확인·조치만. 예배위원 메뉴에 보고서 작성 링크.
- DB37 `20261120000000_pd_positions_mentions.sql`: 'PD' 파트(1~3부·라이프라인), 직책 'PD'와 모든 파트의 '기타 교역자'(교역자 계정 필요·작성 전용·검토 불가, 보고 층은 교역자 층 3). set_memberships_with_minister·group_content_layer 갱신. 주간 미제출 알림에서 기타 교역자 제외(reminders.ts). 모임별 3시간 알림(claim_meeting_reminders)은 그대로라 일정이 등록된 파트면 기타 교역자도 받을 수 있음.
- 부서 멘션: details.mentions(최대 5) → 제출 시 트리거가 report_mentions 동기화, 새로 멘션된 부서 직접 소속자에게 종 알림(본문 미포함, 제출 푸시 경로로 휴대폰 알림). 기존 정책은 그대로 두고 reports_mention_read 정책과 can_view_report에 멘션 조건만 추가. 같은 층 작성자끼리는 기존대로 이미 서로 봄.
- DB `20261127000000_report_leader_notify.sql`: details.notify='clergy'(활성 교역자, 목사님·사모님 제외) 또는 'leadership'(목사님·사모님·교역자). 제출(비draft) 시 트리거가 종 알림 생성(키 `보고id:leaders:사용자id`로 1인 1회, 작성자 제외) → 기존 제출 푸시 경로로 휴대폰 알림. 이분들은 이미 제출 보고를 읽을 수 있어 열람 권한 변경 없음. UI는 '다른 팀에 알리기'(MentionPicker).
- DB `20261128000000_report_minister_notify.sql`: 사용자 요청으로 '교역자 전체' 대신 교역자를 이름으로 골라 알림(details.notify_ministers, 활성 is_minister만 유효, 최대 50). 화면의 '교역자에게 알리기'는 활성 교역자 이름 목록(모두 선택 버튼). 'leadership'은 그대로, 예전 'clergy' 값도 트리거가 계속 처리.
- tests/feedback-round3.test.mjs 3개, rls 시드 기대값(그룹 25·예배 연결 103) 갱신. lint·tsc·test:db 114/114·next build 통과. 배포 안 함.

### 2026-10-28 교회보고서 피드백 3차: 보고서 사진 첨부 (로컬, 운영 미적용)
- DB38 `20261121000000_report_images.sql`: 비공개 Storage 버킷 report-images(JPEG, 1MB), report_images 표(보고서당 5장, 경로 '보고서ID/사진ID.jpg'), storage.objects 정책은 경로의 보고서 ID로 can_view_report/can_edit_report 확인.
- 화면: 보고서 화면 '사진' 카드(ReportImages). 브라우저에서 긴 변 1600px JPEG로 줄여 Storage에 직접 올리고(Vercel 4.5MB 제한 회피) attachReportImage로 연결, 실패 시 파일 삭제. 열람은 1시간 서명 주소. 임시저장 삭제 시 사진 파일 먼저 삭제.
- tests/stub.mjs에 storage 스키마 흉내 추가, tests/report-images.test.mjs. lint·tsc·test:db 115/115·next build 통과. 실제 Storage 업로드·휴대폰 HEIC 변환은 미확인.
- 운영 적용 순서: scripts/check-db34-db38.sql로 확인 → DB34~DB38 파일 순서대로. DB34의 enum 값 추가는 같은 트랜잭션에서 쓰지 않는다.

## 기도회 보고 수정 (2026-10-29, 로컬)
- 문의: 기도회 보고가 수정되지 않음 → 원인: 수정 기능이 없었다(화면 없음, DB는 select·insert만 허용).
- DB39 20261122000000_prayer_edit.sql: 작성 교역자 본인만 update(구분·날짜·제목·참석명단·기도제목 열만). 요일·필수 검사 트리거를 수정에도 적용.
- prayer-meetings: 본인 보고에 「수정」 펼침 폼, editPrayerMeeting 서버 액션. tests/prayer-edit.test.mjs.
- 운영 적용은 DB34~DB38 다음 순서. 승인 전 미적용.
- 2026-10-29 운영 반영: 사용자가 SQL 편집기에서 DB39 직접 적용. release/prayer-edit 26d9e00을 origin/master에 정상 push(5a94787→26d9e00), Vercel 9nQvNgdTg3onhkri7AoTTfbu4bwF success. 운영 /prayer-meetings 비로그인 → /login 307, /login 200 확인. 실제 로그인 수정은 미확인.
- 이 브랜치(피드백 1~3차)를 반영할 때 새 master 위로 옮기고 같은 내용의 1f1f376은 뺀다.

### 2026-10-29 화면 조회 병렬화 운영 배포 (속도)
- 10/27 로컬 속도 수정(feature/ministry-reporting-round-two 1caa1ed)을 최신 master 위 release/perf-parallel로 옮김(3f739c0). 서울 지역 vercel.json은 이미 5e2faee로 반영돼 있어 제외. 10/27 진단 기록은 feature 브랜치 32b114b에만 있음.
- 홈: 관리자 제출현황 조회를 다른 6개 조회와 함께 시작. 보고서 화면: 확인 기록·팀 이슈·그룹·초안·권한·사진 목록 조회를 한 번에 시작(4e8503d에서 새 사진 조회도 포함). createClient는 connection() 뒤 세션 초기화. RLS/권한/화면 변경 없음.
- lint, tsc, test:db 116/116, next build --webpack 통과 → 4e8503d master 일반 push → GitHub 상태 Vercel success(CswoMyTui5eKTMDspVbaiFTjsT3t). 운영 /login 200, x-vercel-id icn1. DB 변경 없음.
- 로그인 뒤 홈·보고서 열기·제출의 전후 응답시간은 아직 재지 않음(개선 폭 미확정).

## 2026-11-02 지난 주 보고 작성 (보고 작성 화면)
- `/write`에 지난 주/다음 주/이번 주 이동(`src/components/week-nav.tsx`), 지난 주면 `PastWeekNotice` 안내. 파트 화면도 주차 유지·「이 주 보고」 표기.
- DB 변경 없음(DB는 미래 날짜만 막음). 미래 주차 URL은 `reportWeek`가 이번 주로 제한.

## 2026-11-05 PC 화면 개편 (feature/pc-layout → master, 운영 배포 f49abcf)
- PC(1024px 이상)만 사이드바·가운데 보고 목록·데스크톱 밀도 CSS(`globals.css` 끝부분, `ui.tsx`의 `ui-btn`/`ui-input`/`page-title`/`page-back` 표시 클래스). 휴대폰 화면은 그대로.
- 홈 파트별 제출현황은 분류별 묶음 + '완료 n/m · 작성 중 k' 막대(완료 = 제출 또는 모임 없음).
- 사이드바 '보고 작성' 밑에 교역자용 '주중 기도회 보고' 버튼.
- 예배위원 한 달 표 `/worship-staff/month`: 요일·month_week로 그 달 예배 날짜를 만들고, 스프레드시트 붙여넣기(`src/lib/worship-staff-month.ts`, 테스트 `tests/worship-staff-month.test.mjs`)로 채운 뒤 바뀐 줄만 저장. 저장은 기존 `worship_staff`(교역자 RLS)에 같은 '안내위원: …' 글 형식으로, updated_at이 다르면 덮어쓰지 않음. 미래 날짜도 저장 가능(DB는 원래 막지 않음, 기존 /worship-staff 화면만 오늘까지). DB 변경 없음.
- PC 가운데 칸 알림 목록: 사이드바 종(`NotificationBell panel`)을 1280px 이상에서 누르면 `notification-panel-store`(sessionStorage) 상태가 켜지고 `DesktopReportColumn`이 `DesktopNotificationColumn`을 보여 준다. 더 좁으면 예전처럼 /notifications로 이동. 위원표 붙여넣기는 탭이 없으면 띄어쓰기 4칸을 칸 구분으로 읽는다(`tabsFromSpaces`).

## 2026-11-05 다크 모드·코멘트 용어·알림함 수정 (feature/pc-layout, 미리보기)
- 다크 모드: `theme-switch.tsx`(기기 설정/라이트/다크, localStorage `tlc-theme`, layout `<head>` 스크립트로 깜빡임 방지). 색은 globals.css 끝의 `[data-theme="dark"]`/`prefers-color-scheme` 변수. 인쇄는 늘 밝게.
- '피드백·댓글' → '코멘트'로 통일. DB 39 `20261129000000_comment_author_titles.sql`: 코멘트·답글 알림 제목에 남긴 사람 이름('○○님이 보고서에 코멘트를 남겼습니다'). 예전 알림 제목은 loadNotifications에서 표현만 바꾼다.
- 알림함: 누르면 바로 이동하고 읽음은 `/api/notifications/read`(keepalive fetch)로 따로 보낸다. 예전에는 서버 액션을 기다린 뒤 이동해 늦고, '이동 중' 상태가 남아 다른 알림을 못 눌렀다. 휴대폰에서 왼쪽으로 밀면 읽음.

## 2026-11-05 팀 태그·이번 주 공지 (feature/pc-layout, 미리보기)
- DB 40 `20261130000000_team_tags_sunday_notice.sql`
  - `report_team_tags` + RPC `tag_report_teams(rid,gids,note)`/`untag_report_team`: 목사님·사모님·교역자(is_clergy)가 제출된 보고를 다른 팀에 메모와 함께 공유. 태그된 팀원은 `is_mentioned_member`로 보기만 가능, 알림(report_event_key → 앱이 휴대폰 알림도 보냄). 작성자 멘션(report_mentions)과 따로 둬서 보고 수정 때 지워지지 않음.
  - `sunday_notices`(주일마다 하나): 교역자·관리자 작성, 승인된 사용자 모두 읽기. 홈 첫 화면 팝업(`sunday-notice-popup.tsx`, 같은 수정본은 기기별 한 번), `/sunday-notice` 작성 화면, 사이드바 '주중 기도회 보고' 아래 버튼.
- 이 SQL 전에는 앱이 오류 없이 빈 상태로 보인다(조회 실패를 무시).
- 6번(팀원 → 담당 교역자 → 목사님·사모님) 흐름은 기존 기능으로 이미 됨: 담당교역자(reviewer)도 같은 예배 보고를 따로 쓸 수 있고(can_write_group), 코멘트로 첨언, 확인 처리, 목사님·사모님은 전체 열람.

## 2026-11-06 예배 PD 체크리스트 1단계 (thelord-office/checklist-design-import, 로컬)
- 설계서·데이터·프로토타입: `docs/pd-checklist/`. 결정: 보고 앱 안 새 메뉴 `/pd-checklist`, 승인된 사용자 누구나 회차 작성(PD 지정 없음), 이번 범위는 화면·공유 저장·인쇄(편집 모드·예배 복제는 2단계).
- DB 41 `20261201000000_pd_checklist.sql`: `pd_templates`(service_key·version·content, 고치지 않고 새 버전 추가, 주일 1부 v1 시드), `pd_runs`(service_key × 주일 날짜, template_version 기억). 읽기는 승인된 사용자, 쓰기는 `pd_run_save(service,date,patch)`·`pd_run_reset(service,date,'checks'|'all')` 함수로만. 체크는 칸 하나씩 합쳐 저장(동시 저장해도 서로 안 지움), 해제·빈 글은 지운다. 기본 조건은 `pd_default_conditions`(성찬 = 1~7일).
- 화면: `src/app/pd-checklist/`(page·checklist·pd-checklist.css, 모든 CSS는 `.pdc` 아래), 계산은 `src/lib/pd-checklist.ts`(시각 offset, 조건, 진행률 — 리포트 분류 제외). 다른 기기 변경은 15초마다·화면 복귀 시 가져온다(저장 중·입력 중이면 건너뜀). 인쇄 형식(작성본/빈 양식)은 기기별 localStorage. 인쇄는 이름 붙인 `@page pdc`(A4 가로)라 다른 화면 인쇄에 영향 없음.
- 메뉴: PC 사이드바 '예배 PD 체크리스트', 휴대폰 홈 '예배위원' 아래 카드.
- 확인: test:db 153/153(새 `tests/pd-checklist.test.mjs`), tsc, eslint, next build --webpack 통과. 임시 미리보기(가짜 DB)로 1440/820/390px 가로 스크롤 없음, 다크 모드, 작성본·빈 양식 PDF 모두 정확히 2페이지 확인. 실제 DB 저장·다른 기기 동기화·로그인 상태 화면은 운영 DB 적용 전이라 미확인.
- 남은 일: 운영 DB에 DB 41 적용(승인 필요), 2단계 편집 모드·예배 복제·2페이지 초과 경고, 2·3부·라이프라인 템플릿(설계서 8장, 담당 PD 확인 필요), 지난 회차 목록.
- 2026-11-06 운영 반영: 사용자가 SQL 편집기에서 DB41 직접 적용. 조회로 sun1 v1(주일 1부, 조건 3), 두 테이블 RLS 켜짐, anon의 pd_run_save 실행 권한 없음 확인. 8b38d77을 origin/master에 일반 push(624f0b5→8b38d77), GitHub 상태 Vercel success(BNQtvdQqAQzaHsBjaKzSsRqfJyJd). 운영 /pd-checklist 비로그인 → /login 307, /login 200. 로그인 화면·저장·기기 간 동기화는 미확인.
- 2026-11-06 템플릿 추가(DB 42 `20261202000000_pd_checklist_services.sql`): 주일 1부 v2(T-5 FINAL 삭제), 주일 2부(10:40)·3부(13:00) v1은 담당자가 준 내용(T-45·T-5 없음, T-20 앞 예배 인수인계 블록, 진행 중 항목 3개, 3부 → 라이프라인 PD 인계), 라이프라인(18:00) v1은 설계서 8장 초안으로 담당 PD 확인 전이다(조건은 변경사항만, 부산 ATEM 블록, 광고·강대상 옮김 담당 칸). 원본은 `docs/pd-checklist/templates-2026-11-06.json`(scratchpad 생성 스크립트로 만들었으므로 앞으로 바꿀 때는 이 JSON을 고쳐 새 버전 insert 마이그레이션을 만든다). 예배 선택 목록은 시작 시각 순으로 정렬. 이미 v1으로 만든 1부 회차는 '전체 초기화' 시 최신 버전으로 바뀐다.
- 2026-11-06 편집 모드(DB 43 `20261203000000_pd_template_edit.sql`): 관리자(`canManage`, DB는 `report.is_admin()`)가 `/pd-checklist/edit`에서 템플릿을 고쳐 새 버전으로 저장한다. `report.pd_template_save(service, base_version, content)`는 최신 버전이 base와 다르면 'version conflict'(동시 편집 방지), 새 예배(복제)는 base 0으로 v1. 자세한 검사는 `src/lib/pd-template-schema.ts`(zod, 서버 액션 `savePdTemplate`과 편집 화면이 같이 씀), DB는 뼈대·크기만 본다. 편집 화면: 기본·조건·팀·1페이지 블록(접기)·FLOW·담당자 칸·진행 중/종료 후·PD REPORT·복제·지난 버전 불러오기(되돌리기), 미리보기는 `PdChecklist preview`(저장 안 함). 체크리스트 툴바에 관리자만 '편집' 버튼. 새 ID는 현재·불러온 버전 어디에도 없는 것으로 만든다. 예배 삭제·숨기기는 아직 없음.
- 2026-11-06 운영 반영: 사용자가 DB42·DB43 직접 적용(조회로 템플릿 5행 md5가 로컬과 같음, `report.pd_template_save` 존재 확인). 8d20da0을 origin/master에 일반 push(8b38d77→8d20da0), GitHub 상태 Vercel success(BmgodFsqps5chD2TjehMsFcYLL5a). 운영 /pd-checklist, /pd-checklist/edit 비로그인 307. 로그인 상태의 편집 저장은 미확인.
- 2026-11-06 주일예배 큐시트(DB 44 `20261204000000_cue_sheet.sql`, 로컬): `/cue-sheet?date=` 메뉴(사이드바·홈). 양식은 예배별 템플릿 `cue`(시간표 rows·담당 staff·송 개수, 사용자 제공 구글 시트 '주일예배 큐시트 양식' 기준)이고, 값은 PD 회차 `pd_runs.roster`(영어는 `키_en`, 비우면 한글)·`pd_name`에 저장한다. 그래서 예배인도 r1·음향 r10·안내 r8·PD·송리스트 song1… 등 같은 키는 PD 체크리스트 담당자 칸과 양방향으로 같은 값. 녹음팀 r19·중계 믹싱 r20·광고/찬양/헌금송/설교 제목(c_*)은 큐시트 전용 키. DB44는 예배별 최신 템플릿에 cue를 넣고 담당자 칸의 '싱어 · 연주'(r9)를 악기 r18·싱어 r9로 나누고 '송리스트' 구분을 더해 다음 버전을 만든다(이미 cue가 있으면 건너뜀). 인쇄는 예배마다 한글·영어 A4 세로 1장씩 총 8쪽(양면 4장). PD 체크리스트 인쇄가 송리스트 줄 때문에 3장이 되어 담당자 칸 높이를 줄였고, 7칸 이상 구분(라이프라인 송리스트)은 한 줄에 넣는다(`.slots-n`). 현재 2쪽 높이 726/741px로 여유가 작다(긴 이름이 여러 줄이면 넘칠 수 있음). 편집 화면은 cue를 보존만 하고 고치지는 못한다.
- 2026-11-06 큐시트 운영 반영: 사용자가 DB44 직접 적용(조회: 예배별 최신 sun1 v4·sun2/sun3/life v3에 cue 있음. 07:49에 사용자가 편집 모드로 저장한 v2/v3 위에 08:09 DB44가 만들어짐). d88da92를 origin/master에 일반 push(8d20da0→d88da92), Vercel success(DG3TuhFYC7tZoUSeqHxuxaVVE8VM). 운영 /cue-sheet 비로그인 307→/login. 로그인 화면·실제 인쇄는 미확인.
- 2026-11-06 큐시트 화면 개편(DB 45 `20261205000000_cue_communion.sql`, 로컬): 입력 폼 대신 PD 체크리스트(.pdc) 디자인의 가로 시트 위에서 칸을 바로 눌러 적는다. 상단 바에 날짜·성찬주간 스위치(주일 1~3부 회차 conditions.communion을 한 번에, PD 체크리스트와 같은 값)·작성 언어(한글/English, 영어 칸은 비우면 한글)·인쇄 언어(한·영/한글/English, 기기별 기억). 인쇄는 @page pdc(A4 가로)로 예배마다 한 장씩. DB45는 주일 1~3부 cue.rows에 헌금 다음 '성찬'(조건 communion, 담당 r6 = PD '성찬 담당') 행을 더한 다음 버전을 만든다. 성찬주간 찬양 15분 등 시간 변화는 큐시트 시간에 반영하지 않았다. 테스트는 템플릿 버전 번호를 최신 값 조회로 비교하게 바꿨다(latestV).
- 2026-11-06 큐시트 개편 운영 반영: 사용자가 DB45 직접 적용(조회: sun1 v5·sun2/sun3 v4에 성찬 행, life v3 없음). aa0f1c0을 origin/master에 일반 push(d88da92→aa0f1c0), Vercel success(EJtupzeTQ4sz9x5eVebM7Gk1X6QR). 운영 /cue-sheet 비로그인 307. 로그인 화면·실제 인쇄 미확인.
- 2026-11-06 회차 최신 템플릿 따르기(DB 46 `20261206000000_pd_runs_follow_latest.sql`, 로컬): 운영에서 이번 주 1부 회차가 v1에 고정되어 송리스트 칸이 안 보이던 문제. 이제 오늘(KST)·앞으로의 회차는 `report.pd_runs_follow_latest`로 늘 최신 버전을 따른다(pd_run_save가 열 때, pd_template_save가 저장할 때 호출, 새 조건은 기본값으로 채우고 기존 값 유지). 지난 회차만 기록 당시 버전. 앞으로 마이그레이션으로 템플릿 버전을 더하면 끝에 이 함수를 불러야 한다. 함께: PD 담당자 칸에서 담당 교역자 r5·성찬 담당 r6 제거(성찬 담당은 큐시트 성찬 줄에서만), 5블록 줄의 칸 너비를 달리 하던 규칙 삭제(모든 블록 같은 너비), 큐시트 송리스트를 원래 시트처럼 세로 목록(순서 표 아래)으로, PD 2쪽 인쇄 여백을 조금 더 줄임(1부 732/741px).
- 2026-11-06 ba7e16e를 origin/master에 일반 push(aa0f1c0→ba7e16e), Vercel success(7Cs3m3hm7ci7aETSb3Tuxq5HzdX6). DB46 운영 적용 여부는 조회하지 못함(작업 탭을 사용자가 쓰고 있어 건드리지 않음).
- 2026-11-06 DB46 운영 적용 확인(사용자 적용): pd_runs_follow_latest 있음, 11/8 회차 sun1 v6·sun2 v5·sun3 v5 = 각 최신, 담당 교역자·성찬 담당 칸 없음, 송리스트 구분 있음.
- 2026-11-06 PD 2쪽 배치: 아래 3칸을 [예배 진행 중 위·종료 후 아래 | 송리스트 박스 | PD REPORT]로. 송리스트(칸 ID가 모두 song…인 구분)는 담당자 칸에서 빼고 가운데 박스에 세로 목록으로 그린다. 담당자 칸 구분 이름(.rl)이 늘 1열에서 시작하게 고침(DB46으로 '순서'가 4칸이 되며 다음 구분 이름이 줄 끝으로 밀리던 버그, 운영에 있던 문제). 2쪽 높이 1부 719·라이프라인 684/741px.
- 2026-11-06 예배별 색·큐시트 2예배 인쇄(로컬, DB 변경 없음): 템플릿 `color`(선택, 없으면 sun1 파랑·sun2 청록·sun3 보라·life 장미, `serviceColor`). 체크리스트 루트와 큐시트 장에 `--svc`를 주면 `.svc`가 --accent/--accent-soft를 바꾼다(다크·인쇄 포함, 제목 아래 색 줄). 편집 화면 기본 칸에 색 고르기. 큐시트 인쇄는 한 쪽(A4 가로)에 예배 두 개(.cue-pair, compact: 순서 표 위, 송리스트·담당 아래 나란히), 한글판 전부 다음 영어판 전부(한·영이면 4쪽). PD 송리스트 박스 클래스 `.songs`가 큐시트 송리스트 표(`.cue-t.songs`)를 flex로 만들던 문제를 `.pd-songs`로 고침(직전 배포에 있던 문제).
- 2026-11-06 e8d1d08을 origin/master에 일반 push(6394759→e8d1d08). Vercel success.
- 2026-11-07 큐시트 송리스트 번호 칸을 넓히고 줄바꿈을 막음(Offering이 두 줄로 깨지던 문제). 34d6d1d를 origin/master에 일반 push(e8d1d08→34d6d1d), Vercel success.
- 2026-11-07 큐시트 작성 칸(input)에 얇은 테두리(--line2, 포커스 시 예배 색), 송리스트 번호 칸 7.5em. 9e3f6d8 위로 rebase 후 0e7f1c3을 origin/master에 일반 push(9e3f6d8→0e7f1c3), Vercel success.

### 2026-11-07 예배위원 404 수정·알림에 예배·모임 표시 (로컬)
- `/worship-staff`의 "예배위원 보고서 · 이슈 작성" 링크가 예배위원 파트를 볼 수 없는 사람(파트 미배정 교역자·일반 사용자, 보고서가 아직 없을 때)에게도 보여 `/groups/[id]`의 `getGroupAccess`가 notFound(404)를 냈음. `can_view_group`이 거짓이면 링크를 숨기고, `can_create_report`가 거짓이면 "예배위원 보고서 보기"로만 연결.
- `loadNotifications`가 알림의 `report_id`(없으면 `/reports/<id>` 주소)로 보고서를 RLS로 조회해 `context`("1부 예배 · 11/2(일) · 영상팀")를 붙임. 알림 화면·PC 알림 칸에 표시. DB 변경 없음, 지난 알림에도 적용. 볼 수 없는 보고서는 표시 안 함.
- 검증: tsc·eslint·next build 성공. 실제 로그인 화면 확인은 못 함.
- 2026-11-07 큐시트 인쇄를 다시 한 쪽(A4 가로)에 예배 하나로: 한글판 1부·2부·3부·라이프라인, 다음 영어판 같은 순서(한·영이면 8쪽, 양면이면 언어마다 2장). compact·.cue-pair 제거. cc0a713을 origin/master에 일반 push(0e7f1c3→cc0a713), Vercel success.
- 2026-11-07 성찬 곡 칸: 성찬주간(conditions.communion)이 켜지면 송리스트 헌금 다음에 성찬 곡(roster 키 song_comm, `COMM_SONG`)이 큐시트·PD 체크리스트 송리스트 박스에 같이 보인다(같은 값). 템플릿 변경 없이 코드 규칙(cueSongKeys(cue, conds)), 라이프라인은 성찬 조건이 없어 안 보임. DB 변경 없음. 큐시트 인쇄 번호 칸 27mm.
- 2026-11-07 DB 50 `20261210000000_cue_offering_staff.sql`(로컬, 운영 미적용. 처음엔 DB47로 만들었으나 다른 작업의 DB47~49와 번호가 겹쳐 50으로): 큐시트 순서에서 헌금송(offsong)·헌금(offering) 줄 제거, 헌금위원 r7을 Staffs로(안내 다음·PD 앞, en 'Offering Team'). 라이프라인은 헌금인도가 18:50-19:05로 이어짐. 모든 예배 최신 템플릿 다음 버전 + pd_runs_follow_latest. 다시 돌려도 건너뜀.

### 2026-11-07 알림함에서 두 번째 알림이 안 열리던 문제 (로컬)
- 증상: 알림 A를 열고 종 버튼으로 알림 화면에 돌아와 B를 누르면 열리지 않고, A에 '화면을 여는 중…'이 남아 있음.
- 원인 추정: cacheComponents의 Activity가 `/notifications`를 숨긴 채 보존해, 돌아왔을 때 A 링크의 `useLinkStatus` 대기 상태가 그대로 되살아남(재현은 로그인 필요라 못 함).
- 수정(`notification-list.tsx`): 새로 들어올 때마다 `useRouter().bfcacheId`를 key로 목록을 새로 만듦(뒤로 가기는 상태 유지). 알림은 `next/link` 대신 `<a>`+`router.push`로 열고 그 줄에만 '여는 중…' 표시, 숨겨질 때 `useLayoutEffect` 정리로 지움. 4초 지나도 화면이 그대로면 `location.assign`으로 직접 엶.
- 검증: tsc·eslint·next build 성공. 실제 휴대폰 재현·확인 못 함.

### 2026-11-07 요청사항 내용 칸이 안 보이던 문제·알림 읽음 누락 (로컬)
- 요청사항: `selectClass`의 `w-full`이 CSS 순서상 `w-24`보다 뒤라 드롭다운이 한 줄을 다 차지하고(shrink-0) 내용 입력(min-w-0)이 폭 0이 됨. `w-24!`로 고정. 같은 조합의 그룹 관리·예배 목록 요일 선택도 함께 수정.
- 알림 '새 알림'이 남던 문제: 읽음은 서버에 사람별로 저장돼 기기 차이는 원인이 아님. 알림함을 거치지 않고(푸시·홈) 보고서를 열거나, 같은 보고서에 알림이 여러 개면 하나만 읽힘. `NotificationSeen`(layout)이 보고서·이슈·공지·메시지 상세를 열면 `/api/notifications/read`에 `{path}`를 보내 그 주소(#·? 뒤 포함)를 가리키는 내 안 읽은 알림을 `read_notification`으로 모두 읽음 처리. DB 변경 없음.
- 알림 목록은 보일 때마다 `loadNotifications`로 읽음 상태를 다시 받음(뒤로 가기·다른 기기 반영). 새로고침 버튼도 같은 방식.
- 검증: tsc·eslint·next build 성공. PostgREST `or`(url.like "…#*") 필터의 운영 동작, 실제 화면은 미확인.

### 2026-11-07 알림 글 중복 제거·PC 목록 칸 넓힘 (로컬)
- 보고서 알림은 위에 예배·모임 줄(예배 · 날짜 · 팀)이 있으므로, 알림 글에서 ` · `로 나뉜 조각 중 팀 이름·날짜·예배/모임 이름·'예배·모임'과 같은 것은 표시할 때 뺌(DB 글은 그대로). 예: "예배팀 · 2026-11-01 · 예배·모임 · 허준석 간사 작성" → "허준석 간사 작성".
- PC 가운데 목록 칸(알림·보고 목록 공통) 너비 330px → clamp(360px, 27vw, 460px).
- 채플 '확인' 버튼 없음은 사용자에게 상황 확인 중. 확인 버튼은 `can_review_report`(담임 또는 그 파트·상위 파트에 교역자/담당교역자로 배정된 교역자)일 때만 보임.

### 2026-11-07 보고 앱 자체 가입 DB47 (로컬, 운영 미적용)
- 사용자 결정: 앞으로 들어올 분 중 셀케어가 필요 없는 분이 많아, 셀케어 명단 없이 보고 앱에서 직접 가입. DB는 같이 쓴다.
- DB47 `20261207000000_self_signup.sql`: `report.signup_requests`(email, pending/rejected, RLS·권한 없음), `report.request_signup(text)`(service_role만 실행, 1시간 전체 30건 제한, 같은 이메일은 한 줄). 셀케어의 `private.gate_new_auth_user()`를 운영 본문(2026-11-07 사용자 조회) 그대로 두고 "보고 앱 가입 신청 대기 중인 이메일" 조건만 OR로 더함. **셀케어 영역(auth 트리거 함수) 변경이므로 사용자 승인 후 적용.** `public.profiles`에는 넣지 않음 → 셀케어에서는 '아직 등록되지 않은 계정'.
- 앱: 로그인 화면 「처음 오셨나요? 가입하기」(`/login?mode=signup`) → `signUp` 서버 액션이 admin 클라이언트로 `request_signup` 후 같은 OTP 발송. 로그인 뒤 기존 onboarding(이름·파트) → 관리자 승인.
- 테스트 `tests/self-signup.test.mjs`(stub에 운영 gate 함수 추가, 트리거는 이 테스트만 붙임): 셀케어 명단 통과·모르는/비활성 이메일 차단·신청 후 통과·중복 1줄·anon/authenticated 실행·조회 차단·거절 이메일 차단·잘못된 이메일·시간당 제한·셀케어 명단 미추가. 전체 test:db 159/159, tsc·eslint·build 성공. 로그인 화면 실제 렌더는 로컬 env가 없어 못 봄.
- 적용 순서: DB47 SQL → 앱 배포. 거절(rejected) 처리 화면은 아직 없음(필요하면 SQL로 status 변경).

### 2026-11-07 큐시트·PD 체크리스트 작성자 지정 DB48 (로컬, 운영 미적용)
- 사용자 결정: 둘 다 지정자만 작성(관리자는 항상), 지정자가 0명인 역할은 지금처럼 누구나 작성.
- DB48 `20261208000000_worship_doc_roles.sql`: `report.worship_doc_roles(user_id, role cue|pd)` 읽기=승인 사용자, 지정·해제=`is_admin()`(담임 포함), 승인된 사용자만 지정. `report.can_write_worship_doc(kind)`(관리자 또는 활성 지정자 0명 또는 본인 지정). `pd_runs`에 BEFORE INSERT/UPDATE 트리거 `pd_runs_guard`: checks·report 변경은 pd, 회차 생성·roster·conditions·pd_name 변경은 cue 또는 pd. auth.uid() 없는 작업(서버·SQL Editor)은 통과. 저장 함수(pd_run_save/reset)는 손대지 않음. 사용 중지된 지정자는 0명으로 침.
- 앱: 관리자 사용자 화면에 '주일예배 문서 작성' 카드(큐시트 작성·PD 체크리스트 작성 지정/해제, 지정 인원 표시). 큐시트는 cue 또는 pd 권한 없으면 입력 readOnly·성찬 스위치 잠금·안내 문구. PD 체크리스트는 pd 권한 없으면 시트를 `<fieldset disabled>`로 잠그고 PD 이름·조건·초기화 숨김/잠금, 저장 안 함. 화면 이동·인쇄는 그대로.
- 테스트 `tests/worship-doc-roles.test.mjs`. 전체 test:db 160/160, tsc·eslint·build 성공. 실제 화면은 로컬 env가 없어 못 봄.
- 적용 순서: DB48 SQL → 앱 배포(앱만 먼저 가면 can_write_worship_doc 호출이 실패해 모두 보기 전용으로 보임).

### 2026-11-07 이름 없이 승인된 사용자 (로컬)
- 증상(사용자 보고): 셀케어 없이 가입한 분이 이름이 비어 있는 채로 들어옴. 원인: 첫 로그인 때 real_name 없는 pending 프로필이 생기고, 이름·파트 신청(onboarding) 전에 관리자가 승인하면 onboarding을 건너뜀(셀케어 명단 사람은 ensure_profile이 셀케어 이름을 넣어 줘서 드러나지 않았음).
- 수정: `requireActive`가 승인됐지만 real_name이 비면 `/onboarding`으로 보냄. onboarding은 이 경우 이름만 받는 화면(`saveRealName`, 본인 real_name 업데이트 — 기존 컬럼 권한). DB 변경 없음.
- 검증: tsc·eslint·build 성공. 실제 화면 미확인.

### 2026-11-07 교역자가 아니면 본인 보고만 DB49 (로컬, 운영 미적용)
- 사용자 결정: 교역자가 아닌 분은 본인이 제출한 것만. 리더(팀 reviewer)는 맡은 팀 보고 유지, 교역자 태그·함께 보는 부서·개별 공유로 받은 보고는 유지.
- DB49 `20261209000000_writer_own_reports.sql`: `same_content_layer`에 `is_clergy()` 조건 추가 → 비교역자의 '같은 직급(층) 보고·이슈 일반 내용 열람'이 사라짐(보고 can_view_report·reports 정책·can_view_group·이슈 읽기 모두 이 함수 사용). 교역자·담임 결과는 그대로. 앱 코드 변경 없음.
- 이전 결정(동급 일반 내용 열람, ministry-round2 테스트)을 사용자 지시로 바꿈: 테스트 2개를 새 규칙으로 수정, `tests/writer-own-reports.test.mjs` 추가(DB49 없으면 실패 확인). test:db 161/161.

### 2026-11-07 PD 체크리스트는 교역자만 (로컬)
- 사용자 결정: 교역자가 아니면 PD 체크리스트를 보지 않아도 됨. 관리자와 'PD 체크리스트 작성' 지정자(DB48)는 예외로 열어 둠(지정자가 교역자가 아닐 수 있음).
- `src/lib/pd-access.ts` `canSeePdChecklist`. 홈·PC 사이드바 메뉴 숨김, `/pd-checklist`·`/pd-checklist/edit`는 홈으로 보냄, 큐시트의 'PD 체크리스트 ›' 버튼 숨김. 큐시트는 그대로 모두에게 보임.
- 화면만 가림: pd_runs는 큐시트가 같이 쓰므로 DB 읽기 권한은 그대로(체크·리포트 값도 API로는 읽힘). DB 변경 없음.
- 2026-11-07 c5a70f4·6078bf3을 883d147(다른 작업 DB47~49 포함) 위로 rebase(414e6ff·9c97eb7), 9c97eb7을 origin/master에 일반 push(883d147→9c97eb7), Vercel success. DB50 운영 미적용.
- 2026-11-07 DB50 운영 적용 확인(사용자 적용): 최신 sun1 v7·sun2 v6·sun3 v6·life v5, 순서에 offsong·offering 없음, staff …r8,r7,pd, 라이프라인 offlead to 65. 11/8 회차 sun1~3 모두 최신 버전.
- 2026-11-07 DB 51 `20261211000000_cue_offsong_back.sql`(로컬, 운영 미적용): 헌금송(offsong, c_offsong)을 헌금인도 다음에 다시(시간은 그 줄이 있던 마지막 버전에서, 라이프라인 헌금인도 18:50-18:55·헌금송 18:55-19:05로 되돌림), Staffs에서 중계 믹싱 r20 제거. 큐시트 작성 칸을 자동으로 늘어나는 textarea(GrowText, field-sizing:content + JS 대체)로: 여러 줄 붙여넣기·긴 명단이 줄바꿈되어 칸이 커짐, 인쇄 .pv pre-wrap. 큐시트 제목 시간 12시간제(13:00 PM→01:00 PM, cueTitle). 복사·붙여넣기는 headless Chrome에서 Ctrl+C/V 동작 확인.
- 2026-11-07 a002818을 origin/master에 일반 push(9c97eb7→a002818), Vercel success. DB51 운영 적용 확인(사용자 적용): 최신 sun1 v8·sun2 v7·sun3 v7·life v6, offsong 복귀, r20 없음, 11/8 회차 모두 최신. 이어서 큐시트 순서 표 시간도 12시간제(cueTime, clock12).
- 2026-11-07 b7ac3e8을 origin/master에 일반 push(a002818→b7ac3e8), Vercel success.
- 2026-11-07 큐시트 오른쪽 위 시작 시각도 12시간제 + 작은 AM/PM(clock12·ampm, .lockup .ampm). PD 체크리스트는 24시간제 그대로.
- 2026-11-07 PD 체크리스트 시각도 12시간제(블록 시각·도착·FLOW·오른쪽 위 시작+AM/PM·예배 선택, 편집 화면 미리보기). DB 52 `20261212000000_cue_drop_recording.sql`(로컬, 운영 미적용): 1부 큐시트 담당에서 녹음팀 r19 제거. 인쇄 명단 keepNames: '이름 (악기)'는 한 덩어리(괄호 앞·안 공백을 nbsp), word-break keep-all — 큐시트·PD 담당자 칸 인쇄. PD 2쪽 긴 악기 명단 시 735/741px.
- 2026-11-07 사용자 요청으로 시간 표기를 모두 24시간제로 되돌리고 AM/PM 제거(큐시트 제목 '(13:00)', 순서 표·오른쪽 위·PD 체크리스트·편집 화면; clock12·ampm 삭제). keepNames를 '쉼표 사이 한 덩어리'로: 쉼표·줄바꿈 사이 띄어쓰기를 nbsp로, 쉼표 뒤 띄어쓰기가 없으면 zero-width space를 넣어 쉼표 뒤에서만 줄바꿈.
- 2026-11-07 d3ab449·f1e368c를 origin/master에 일반 push(338a4c0→f1e368c), Vercel success. DB52 운영 적용 확인(사용자 적용): sun1 v9 담당에 r19 없음, 11/8 sun1 회차 v9.
- 2026-11-07 인쇄 줄바꿈 다시: keepNames(담당 칸만)는 구분자(, / · ;) 뒤·닫는 괄호 뒤 띄어쓰기·줄바꿈에서만 줄을 바꾼다('김소은 (건반) / 안경용 (베이스) 송재혁 (일렉)'). 순서·송리스트 칸은 keepPhrase: 띄어쓰기에서 바꾸되 '낱말 (괄호 묶음)'과 숫자 붙임표(9:1-8, U+2011)는 쪼개지 않음. PD 송리스트 박스도 keepPhrase.
- 2026-11-07 8423127을 origin/master에 일반 push(f1e368c→8423127), Vercel success.
- 2026-11-07 DB 53 `20261213000000_pd_drop_worship_team.sql`(로컬, 운영 미적용): PD 체크리스트 담당자 칸에서 '예배팀'(악기 r18·싱어 r9) 구분 제거(운영 2쪽이 3페이지로 넘침). 예배 인도자 r1은 '순서'에 그대로, 악기·싱어는 큐시트 Staffs에서만. 실제 11/8 값으로 2쪽 높이 1부 716·2/3부 683·라이프라인 681 / 741px.
- 2026-11-07 DB53 운영 적용 확인(사용자 적용): 최신 sun1 v10·sun2 v8·sun3 v8·life v7, PD 담당자 구분 = 순서·예배위원·기술팀·송리스트, 11/8 회차 모두 최신.
- 2026-11-07 인쇄 명단을 NameList 컴포넌트로(splitNames): 사람 단위 inline-block, '/'·'·'는 다음 사람 앞 ::before(.75em)로 두고 줄을 .75em 왼쪽으로 당겨 overflow:hidden으로 줄 첫머리의 '/'를 숨김. 쉼표·세미콜론은 앞 사람 끝에 붙음. keepNames 삭제. 영어 큐시트 오른쪽 위 예배 이름 serviceNameEn(cue.label): '1st Service'…'Lifeline'.
- 2026-11-07 e5b4384를 origin/master에 일반 push(8423127→e5b4384), Vercel success.
- 2026-11-10 DB 54 `20261214000000_free_text_reports.sql`(로컬, 운영 미적용): 사용자 요청 "글자수 제한 아예 풀어줘". 보고서 본문(여러 줄 칸) 글자수 제한 제거. 화면 TextArea 기본 maxLength(1000)·각 칸 maxLength, 서버 zod(report-forms longText·요청·말씀·기도제목, team-session 본문·결석 사유·후속 조치, 주중 기도회 참석자·기도제목, 예배 이슈 경위·원인·조치·대책, 예배위원 명단), DB check(report_prayers, report_issues content·action, report_messages, prayer_meeting_reports/drafts, worship_incidents, worship_staff) 상한 제거. 꼭 쓰는 칸은 '비어 있지 않음'만 유지. 자동저장 한도 256KB→1MB(앱·report_drafts check·autosave_report). 한 줄 칸(이름·학년·연락처·본문 구절·제목 등)과 코멘트·답글·공지 길이 제한은 그대로. 남은 한도: Next 서버 액션 요청 1MB, 영문 번역은 보고 전체 24000자 넘으면 'too-long'. 테스트 tests/free-text-reports.test.mjs(DB54 없으면 실패 확인). 앱만 먼저 배포하면 2000자 넘는 말씀·1000자 넘는 이슈가 DB에서 저장 실패하므로 DB54 먼저.
- 2026-11-10 acde420을 origin/master에 일반 push(24838f7→acde420), Vercel success. DB54 운영 적용 확인(사용자 적용, 확인 쿼리 상한_제거·이슈_본문·자동저장_1MB 모두 true). 채팅 붙여넣기 때 긴 한 줄(함수 머리)이 잘려 42601 문법 오류가 한 번 났음 → SQL은 짧은 줄로 나눠 전달.
- 2026-11-10 미제출 보고 화면 `/missing`(DB 변경 없음): 사용자 요청 "사람별 부서별 미싱 보고서, 담당교역자·사모님·담임목사님". 교역자만(isClergy), 담임 목사님·사모님(recipient_role)은 전체 부서, 담당 교역자는 report.assigned_clergy와 같은 기준(reviewScope: position null+reviewer 또는 교역자·담당교역자, 하위 그룹 포함). 마감(금 17시) 지난 최근 4/8/12주, 미제출 기준은 회의 자료·금요일 알림과 같음(하위 없는 활성 주간 그룹, 예배·기술팀 제외, 제출 없음·모임 없음 아님). 그 주 마감 뒤에 만든 부서·맡은 작성자는 그 주에 안 셈. 사람별은 writer 기준(직접 작성자 없으면 가장 가까운 상위 그룹 작성자, 활성 계정만, 없으면 '작성자 미지정'). 진입: 사이드바 목회 '미제출 보고', 회의 자료 1. 제출 현황 위 링크. src/lib/missing-reports.ts, tests/missing-reports.test.mjs.
- 2026-11-11 보고서 모임 날짜 수정(DB 변경 없음): 사용자 요청 "예배팀 전체 모임을 다음 날 작성해서 11/11로 나옴, 모임 날짜 수정 기능 필요". 보고서 화면 제목 아래 「모임 날짜 수정」(can_edit_report인 사람: 작성자는 확인 전까지, 검토자). changeMeetingDate(src/app/reports/[id]/actions.ts): 오늘 이후 불가(DB 트리거 prevent_future_report_date도 막음), 정해진 요일의 예배·모임(service_types·group_meeting_types)은 같은 요일만, 부산 방문 보고는 제외(본문 출발일로 수정). week는 생성 열이라 자동으로 따라 바뀜. 주의: 예배 보고 날짜를 옮기면 그 날짜 기준인 사고 보고(worship_incidents.occurred_on)·예배위원(worship_staff.held_on)은 따라가지 않음. tests/meeting-date-edit.test.mjs.

## 2026-11-10 PC 사이드바 접기

- `desktop-sidebar-nav.tsx` 맨 위 `.app-sidebar-toggle`로 268px(900~1199px는 232px) ↔ 64px. 상태는 `<html data-side="mini">` + localStorage `tlc-side`(THEME_SCRIPT가 그리기 전에 넣음), 컴포넌트는 `useSyncExternalStore`로 읽는다.
- 접히면 아이콘만(title 도움말), 목회·관리 묶음은 펼친 아이콘 줄, 「내 파트」 목록·밝기·로그아웃은 숨김. 아래 이름 칸(아바타)을 눌러도 펼친다. 휴대폰 화면은 그대로. DB 변경 없음.
- 검증: test:db 166 통과, eslint(바꾼 파일)·tsc 통과, next build 성공. 운영 화면에 새 CSS만 넣어 접힘 모양(64px·글자 없음·가로 넘침 없음)을 확인했고, 로그인한 새 화면 전체는 배포 후 확인 필요.

## 2026-11-10 부서 안건방 (DB 56 `20261216000000_dept_agenda.sql`)

- 요청: 담임 목사님·사모님이 보고서 외에 부서 안건을 직접 말하는 창구. 기존 「대상 지정 소식」을 키우는 안 대신 새 안건방으로 결정(사용자, 2026-11-10).
- DB: `agenda_items`(부서·제목·내용·상태 open/done·last_activity_at), `agenda_replies`. 글자 수 상한 없음(빈 글만 막음).
  - 보는 분 `agenda_member(user, group)`: 두 분, 또는 그 부서와 위·아래 부서에서 reviewer(총괄·부장·팀장)이거나 교역자 계정의 직책 '교역자'·'담당교역자'. 팀원·작성자·'기타 교역자'·기능 관리자는 못 봄.
  - 올리기는 두 분만(RLS), 지우기는 올린 분만. 상태는 `set_agenda_status`(두 분만). insert는 칼럼 단위 grant라 상태를 직접 넣을 수 없음.
  - 알림: 새 안건 → 보는 분 모두(올린 분 제외). 답글 → 두 분이 쓰면 보는 분 모두, 다른 분이 쓰면 두 분 + 올린 분 + 앞서 답글 단 분. 알림 문구에 본문은 넣지 않고 부서 이름만. `inbox_notifications.agenda_id`(안건 지우면 같이 지워짐). inbox_read 정책은 바꾸지 않음.
- 앱: `/agenda`(진행 중·완료·전체, 두 분은 새 안건 올리기), `/agenda/[id]`(본문·답글·완료 표시·지우기). 푸시는 `lib/agenda-push.ts`가 트리거가 만든 알림함 행으로 보냄. PC 사이드바 「부서 안건」, 휴대폰 홈 버튼, 알림함 종류 「부서 안건」. 메뉴 보임 기준은 DB `agenda_visible()`과 같음.
- 테스트: tests/dept-agenda.test.mjs(권한·알림 대상·상태·지우기·재실행), tests/agenda-push.test.mjs, notification-category 갱신.

- 2026-11-10 DB 55 `20261215000000_pd_merge_atem.sql`(로컬, 운영 미적용): 1쪽 '부산 ATEM' 블록을 같은 줄 바로 앞(10분 안) 블록(T-30 시스템 · 도착)에 합침(앞 내용 → ATEM 내용 → '도착 확인'부터), 시스템 점검의 '부산' 칸(c7) 제거, 합친 블록은 새 블록 옵션 wide(두 칸 + 안쪽 두 단, 편집 화면 '넓게(2칸)'). 대상 라이프라인·1부(운영 v7·v13 기준으로 시험). 1부에 T-10 '목사님·사모님 마이크 컨퍼런스룸 전달'(e_mic)·'예배 전 의전 음료 확인'(e_drink), 2쪽 진행 중 '설교 등단 전 마이크 위치 확인'(j_micpos). 인쇄 1부 636/736, 라이프라인 631/681 (한도 741). 운영 양식은 편집 화면으로 자주 바뀌니 마이그레이션은 운영 내용 기준으로 일반화해 쓸 것.
- 2026-11-13 개선안 1단계 용어 통일(화면 문구만, 권한·데이터·알림 규칙 그대로): 사용자가 준 「01_TLC_교회_보고서_개선안.md」(바탕화면, Orca 전달 zip과 같음) 작업 순서 1번. 보고 상태 REPORT_STATUS_LABEL = 작성 중·확인 대기·확인 완료(예전 임시저장·제출·확인됨), 홈 숫자 세 칸도 겹치지 않게 작성 중·확인 대기·확인 완료(status=reviewed 링크). 「보고 쓰기」(예전 보고 작성·보고서 작성·보고 작성 · 추가), 「보고 목록」(/reports, 예전 내 보고서·보고 목록 · 제출현황), 관리 아래 전체 제출현황·팀 명단(/team-management)·가입 승인·담당 지정(/admin/users), 사이드바 「교역자 회의 자료」「알림 설정」, 기도회 제목 「주중 기도회 보고」. 버튼 「임시저장」은 동작 이름이라 그대로. 담임 목사님·사모님의 /manage 제목 「전체 사역 관리」는 그대로 둠. 주소(URL)는 바꾸지 않음. guide.html·staff-guide.html 업데이트 소식 11/13 「이름 정리」 NEW.
- 2026-11-13 개선안 2단계 디자인 규칙(시안 C, 화면 모양만): globals.css @theme에서 text-xs·sm=15px, base 17, lg·xl 20, 2xl·3xl 26(인쇄는 @media print에서 예전 12/14/16/18/20/24 그대로). CSS 직접 font-size 15px 미만은 15px로(▾ 화살표·kbd만 예외, 알림 종 숫자 text-[10px]도 그대로). 상태 색 토큰 --st-{todo,draft,wait,done}(+bg, dot, 다크 모드), .st/.st-* 클래스, ui.tsx StatusChip·listRowClass. ReportStatusBadge·회의 자료 STATUS(확인 완료/확인 대기/작성 중)·홈 숫자 칸·파트 줄·PC 목록 알약이 상태 색 사용. accent #6b2c2c. smallButtonClass는 테두리+버건디 글자(보조 버튼 작은 판), BackLink는 글자 링크(테두리 없음, 높이 44 유지). Card p-4·rounded-2xl, PageTitle mb-6. 📖·📌·🔔 이모지 제거. PC 버튼·입력칸 높이(40px)는 마우스용으로 그대로 둠(사용자 확인 필요).
- 2026-11-13 개선안 3단계 홈 재구성(화면만, 권한·데이터 그대로): 홈 = 인사말(주·전달 시각) → 교역자·관리자 요약 카드(확인 대기 수+확인하러 가기, 작성 중·확인 완료, 아직 보고 없는 파트 수; 관리 권한은 admin_submission_status 전체, 아니면 내 파트·열람 보고 기준) → 내 파트 카드(src/lib/home-parts.ts partCardState: 내 임시저장 → 이어 쓰기, 제출 → 확인 대기/완료 보기, 모임 없음, 남의 작성 중, 작성 전/마감 뒤 미제출 → 쓰기; 교육 파트는 출결·명단 링크; 내 파트는 직접·상위 소속만, 관리 권한으로 보이는 전체 파트 제외) → 새 코멘트·답글(안 읽은 알림 중 feedback 분류 3건) → 소식(공지 2, 부서 안건, 확인·조치 미해결 worship_incidents 수, 이번 주 공지 쓰기). 새 화면 /more(더보기): 보고·예배 도구·목회·관리·교회학교 출결·설정·도움말·내 소속·로그아웃. 홈의 파트별 제출현황 목록은 PartStatusList로 /admin/submissions 위로 이동. GroupPicker 홈에서 제거(보고 쓰기 화면이 같은 역할). tests/home-parts.test.mjs.
- 2026-11-13 개선안 4단계 메뉴: 휴대폰 하단 탭 5개(bottom-navigation-links.tsx) — 작성자·교역자·관리자: 홈·보고 쓰기(/write, /groups, /reports/[id] 강조)·보고 목록·공지·소통(/notices·/agenda·/incidents)·더보기(/more와 관리·설정·예배 도구 화면들). 담임 목사님·사모님(isSenior): 홈·주간 요약·확인·조치·부서 안건·더보기(개선안의 받은 글은 따로 모은 화면이 없어 넣지 않음, 비공개 메시지는 더보기). 관리 탭 없앰(더보기·PC 메뉴). --bottom-nav-height 4.25rem, main 아래 여백 +2rem. PC 사이드바: 보고(홈·보고 목록·[교역자] 주간 요약·미제출 보고·교역자 회의 자료·주중 기도회 보고·확인·조치) / 소통(공지·소통·부서 안건·[교역자] 비공개 메시지·이번 주 공지) / 예배 도구 / 내 파트 / 관리(접힘). 보고 쓰기 버튼은 담임 목사님·사모님에게 안 보임(/write 주소와 더보기 항목은 그대로). 홈의 더보기 줄은 탭이 생겨 뺌. staff-guide 관리 탭 → 관리 메뉴.
- 2026-11-13 개선안 5단계 보고 쓰기 흐름(화면만): /write는 쓸 수 있는 파트가 하나(관리 권한으로 다른 파트 없음)이고 쓰다 만 보고가 없으면 /groups/{id}?week=#new-report로 바로 감. 파트 화면(/groups/[id]): 맨 위 새 보고 쓰기(보고 종류·예배·모임, 작성자·담당은 접힌 한 줄+바꾸기, 이름 없으면 펼침) → 탭 ?tab=team 없음=이번 주 보고(보고 목록+모임 없음 #no-meeting) / team=팀 관리(팀 구성 명단·모임 시간 설정·리허설·명단·공지 링크). 지난번 내 보고(이 파트 최신, details->>session_type·service_type_id·group_meeting_type_id만 조회)로 보고 종류·예배를 미리 고름(이번 주 선택지에 있을 때만). 홈 카드 작성 전/미제출이면 「모임 없음 표시」 링크.
- 11/13 개선안 6단계: 보고 상세는 본문을 위로(알림·메타 한 줄·열람 현황 한 줄 → 본문 → 받은 글·담임 확인 버튼·검토 확인·수정·사진·공유·날짜 수정). 열람 현황은 details로 접음. 보고 목록은 상태 알약 링크(누르면 적용) + 작성자·정렬은 「필터」 details.
- 11/13 개선안 6단계 보완: 보고 상세 메타 줄은 빈 담당(또는 '파트')을 빼고 시각은 formatDateTime(「11/12 오후 12:35」, src/lib/week.ts). 보고 목록 날짜·제출 시각·열람 시각도 같은 형식.
