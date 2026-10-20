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
