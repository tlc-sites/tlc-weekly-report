# 처음 세팅하기

보고 앱은 **tlc-cellcare Supabase 프로젝트를 함께** 씁니다.

- 모든 DB 객체는 `report` 스키마에 둡니다. 셀케어의 `public` 스키마와 `auth` 트리거는 건드리지 않습니다.
- 로그인은 셀케어와 같은 방식입니다. 이메일을 입력하면 숫자 코드(와 로그인 링크)가 메일로 오고, 비밀번호는 없습니다. 셀케어 교인 명단에 이메일이 등록된 사람만 로그인할 수 있습니다.
- 보고 앱 권한은 따로입니다. 처음 로그인하면 가입 신청을 하고, 보고 앱 관리자가 승인합니다.

## 1. DB 적용 (tlc-cellcare 프로젝트)

### 새 DB에 처음 적용할 때

**SQL Editor**에서 아래 파일을 번호 순서대로 **한 파일씩 실행**하고, 각 실행이 성공했는지 확인합니다.

| 순서 | 파일 | 내용 |
|---|---|---|
| 1 | `supabase/migrations/20261016000000_init.sql` | report 스키마, 테이블, RLS, 승인 RPC |
| 2 | `supabase/migrations/20261017000000_admin_tools.sql` | 그룹 계층 검사, 소속·관리자 관리 RPC |
| 3 | `supabase/migrations/20261018000000_restructure_types.sql` | 그룹 유형 enum 변경 (`worship`, `campus`) |
| 4 | `supabase/migrations/20261018000001_restructure.sql` | 조직 재구성, 부산 캠퍼스, 받는 분께 드리는 글, 언어 설정 |
| 5 | `supabase/migrations/20261019000000_save_report.sql` | 보고 일괄 저장 RPC |
| 6 | `supabase/migrations/20261020000000_push.sql` | 푸시 구독 저장 RPC, 관리자용 알림 설정 현황 |
| 마지막 | `supabase/seed.sql` | 예배 5개, 교육부서 8개, 예배팀 10개, 부산 캠퍼스, 운영 설정 |

**3번은 반드시 별도로 실행을 완료한 뒤 4번을 실행합니다.** 새 enum 값은 추가한 트랜잭션 안에서 사용할 수 없으므로, 3번과 후속 파일을 합쳐 실행하거나 하나의 `BEGIN`/`COMMIT`으로 묶지 않습니다.

seed는 마이그레이션 1~6을 모두 적용한 뒤 마지막에 실행합니다. seed가 `worship`, `campus` 유형을 사용하므로 init 직후 실행하면 안 됩니다.

**Project Settings > Data API > Exposed schemas**에 `report`를 추가하고 저장합니다. 이걸 빼면 앱에서 테이블을 찾지 못합니다.

### 이미 운영 중인 DB를 갱신할 때

적용 이력과 실제 DB 구조를 확인한 뒤, 아직 적용하지 않은 마이그레이션만 위 순서대로 실행합니다. 초기화나 seed부터 다시 실행하지 않습니다. 현재 tlc-cellcare 운영 DB는 적용 이력 테이블이 없어 실제 객체로 상태를 판별했으며, 2026-10-19에 6번 마이그레이션을 적용하고 두 푸시 함수와 권한을 확인했습니다. SQL Editor로 수동 적용한 파일은 별도 적용 기록도 함께 확인합니다.

## 2. 인증 설정

- **Authentication > URL Configuration > Redirect URLs**에 보고 앱의 `/auth/callback` 주소를 추가합니다(개발: `http://localhost:3000/auth/callback`, 운영: `https://<보고 앱 도메인>/auth/callback`). 기존 셀케어 주소와 Site URL은 그대로 둡니다.
- 로그인 메일은 셀케어와 같은 메일 설정으로 발송됩니다. 사용자가 늘면 Authentication > Emails의 SMTP 설정과 발송 한도를 확인해 주세요.

## 3. 환경변수와 로컬 실행

`.env.example`을 참고해 `.env.local`을 만들고 **Project Settings > API**의 Project URL과 Publishable key를 넣습니다.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<프로젝트 ID>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxx
```

```sh
npm install
npm run dev
```

개발 주소는 `http://localhost:3000`입니다. 푸시까지 점검하려면 아래 환경변수도 설정하고 개발 서버를 다시 시작합니다. `.env.local`과 실제 키는 커밋하거나 공유하지 않습니다.

## 4. 첫 관리자 지정

1. 셀케어에서 쓰는 이메일로 보고 앱에 로그인하고 가입 신청(소속 선택)을 마칩니다.
2. SQL Editor에서 본인 이메일로 바꿔 실행합니다.

   ```sql
   update report.profiles set status = 'active', is_admin = true
   where email = '본인 이메일';
   ```

이후 가입자는 앱의 **사용자 관리** 화면에서 승인합니다.

## 5. 웹 푸시와 Vercel 환경변수

의존성을 설치한 뒤 VAPID 키 쌍을 한 번 생성합니다.

```sh
npx web-push generate-vapid-keys
```

출력된 Public Key와 Private Key를 각각 아래 변수에 넣습니다. 같은 배포에서 사용하는 공개 키와 비공개 키는 반드시 한 쌍이어야 합니다. 생성한 키는 안전하게 보관하고, 배포할 때마다 새로 생성하지 않습니다.

Vercel 프로젝트의 환경변수 설정에 Supabase 연결 변수 2개와 아래 **푸시·서버용 변수 4개 및 `CRON_SECRET`**을 등록합니다. 운영에는 Production 환경에 적용하고, Preview에서 사용할 경우 해당 환경에도 등록합니다.

| 변수 | 넣을 값 | 공개 여부 |
|---|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | 생성한 Public Key | 브라우저에서 사용 |
| `VAPID_PRIVATE_KEY` | 같은 쌍의 Private Key | 서버 전용 |
| `VAPID_SUBJECT` | 관리자가 받는 실제 연락처, 예: `mailto:admin@your-church.org` | 서버에서 사용 |
| `SUPABASE_SECRET_KEY` | 같은 Supabase 프로젝트의 Project Settings > API Keys에서 확인한 secret key | 서버 전용, RLS를 우회하는 관리자 권한 |
| `CRON_SECRET` | 충분히 긴 무작위 비밀 문자열 | 서버 전용, 크론 인증 |

`CRON_SECRET`은 다음 명령으로 생성할 수 있습니다.

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

서버 전용 키에는 `NEXT_PUBLIC_` 접두사를 붙이지 않습니다. 로컬 푸시·크론 점검에도 같은 이름의 변수를 `.env.local`에 설정합니다. 환경변수를 등록하거나 변경한 뒤에는 변경값이 반영되도록 새로 배포해야 합니다. 특히 `NEXT_PUBLIC_` 변수는 빌드 시 반영됩니다.

배포 후 HTTPS 주소에서 로그인하고 **알림 설정**에서 기기별 알림을 켠 뒤 테스트 알림을 확인합니다. 아이폰은 Safari에서 홈 화면에 추가한 앱으로 열어야 푸시를 받을 수 있습니다. 카카오톡 인앱 브라우저에서는 화면의 안내에 따라 외부 브라우저로 엽니다.

## 6. Vercel 크론과 발송 없는 점검

현재 `vercel.json`에는 다음 크론이 정의돼 있습니다. 배포 후 Vercel 대시보드에서 실제 등록 여부와 실행 시각, 사용 중인 플랜의 제한을 확인합니다.

| 경로 | UTC 설정 | 한국 시간 | 내용 |
|---|---|---|---|
| `/api/cron/mon-am` | `0 0 * * 1` | 월요일 09:00 | 미제출 그룹 작성자·검토자 알림 |
| `/api/cron/mon-pm` | `0 11 * * 1` | 월요일 20:00 | 미제출 알림 + 관리자 요약 |
| `/api/cron/tue-digest` | `0 23 * * 1` | 화요일 08:00 | 검토자·관리자 회의 자료 안내 |

Vercel Cron은 `CRON_SECRET`을 `Authorization: Bearer <비밀값>` 헤더로 보냅니다. 실행 시각은 `vercel.json`에 고정돼 있으며 DB의 `app_settings.deadline`/`reminders` 값은 현재 코드에서 읽지 않습니다.

아래는 PowerShell에서 로컬 개발 서버의 대상을 확인하는 예입니다. `$env:CRON_SECRET`은 요청을 보내는 셸에도 별도로 설정해야 합니다(`.env.local`은 PowerShell 환경변수로 자동 로드되지 않습니다).

```powershell
Invoke-RestMethod -Uri 'http://localhost:3000/api/cron/mon-am?dryRun=1' -Headers @{ Authorization = "Bearer $env:CRON_SECRET" }
```

`mon-am`을 `mon-pm`, `tue-digest`로 바꿔 각 슬롯을 확인할 수 있습니다. 운영 점검은 호스트를 실제 배포 주소로 바꿉니다. **`?dryRun=1`을 유지하면 발송과 중복 방지 기록 저장 없이 대상만 확인합니다.** 쿼리를 빼면 실제 발송 경로가 실행됩니다.

## 셀케어 계정이 없는 사람

예배팀원처럼 셀케어를 쓰지 않는 사람도 교인 명단에 이메일이 있어야 로그인할 수 있습니다. 셀케어 앱의 「등록 신청하기」로 신청하고 셀케어 관리자가 승인하면, 보고 앱에서 같은 이메일로 로그인할 수 있습니다. 셀케어 권한(셀 보고 등)은 셀케어에서 따로 주지 않는 한 생기지 않습니다.

## 로컬 검증

DB 권한·기존 DB 업그레이드·알림 대상 계산은 로컬 Postgres(PGlite)와 테스트로 검증할 수 있습니다. 외부 DB 연결은 필요하지 않습니다.

```sh
npm run test:db
```

이 테스트 통과만으로 운영 DB 적용, Vercel 배포·크론 등록, 실제 기기의 푸시 수신까지 확인되는 것은 아닙니다. 운영 반영 상태와 실기기 점검은 따로 확인합니다.
