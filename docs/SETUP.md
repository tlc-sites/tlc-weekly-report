# 처음 세팅하기

보고 앱은 **tlc-cellcare Supabase 프로젝트를 함께** 씁니다.

- 테이블은 모두 `report` 스키마에 있고, 셀케어의 `public` 테이블과 트리거는 건드리지 않습니다.
- 로그인은 셀케어와 같은 방식입니다. 이메일을 입력하면 숫자 코드(와 로그인 링크)가 메일로 오고, 비밀번호는 없습니다. 셀케어 교인 명단에 이메일이 등록된 사람만 로그인할 수 있습니다.
- 보고 앱 권한은 따로입니다. 처음 로그인하면 가입 신청을 하고, 보고 앱 관리자가 승인합니다.

## 1. DB 적용 (tlc-cellcare 프로젝트)

1. **SQL Editor**에서 아래 두 파일의 내용을 순서대로 붙여 넣고 실행합니다.
   - `supabase/migrations/20261016000000_init.sql` (report 스키마, 테이블, 권한)
   - `supabase/seed.sql` (예배 목록, 교육부서 7개, 기술팀 4개 파트)
2. **Project Settings > Data API > Exposed schemas**에 `report`를 추가하고 저장합니다. 이걸 빼면 앱에서 테이블을 찾지 못합니다.

## 2. 인증 설정

- **Authentication > URL Configuration > Redirect URLs**에 보고 앱의 `/auth/callback` 주소를 추가합니다(개발: `http://localhost:3000/auth/callback`). 기존 셀케어 주소와 Site URL은 그대로 둡니다.
- 로그인 메일은 셀케어와 같은 메일 설정으로 발송됩니다. Supabase 기본 메일 발송은 시간당 발송량이 적으니, 사용자가 늘면 Authentication > Emails의 SMTP 설정을 확인해 주세요.

## 3. 환경변수와 실행

**Project Settings > API**의 Project URL과 Publishable key를 `.env.local`에 넣습니다.

```
NEXT_PUBLIC_SUPABASE_URL=https://mcbbhsvvzqvtrxlbdcks.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxx
```

```
npm install
npm run dev
```

## 4. 첫 관리자 지정

1. 셀케어에서 쓰는 이메일로 보고 앱에 로그인하고 가입 신청(소속 선택)을 마칩니다.
2. SQL Editor에서 실행합니다.

   ```sql
   update report.profiles set status = 'active', is_admin = true
   where email = '본인 이메일';
   ```

이후 가입자는 앱의 **사용자 관리** 화면에서 승인합니다.

## 셀케어 계정이 없는 사람

기술팀원처럼 셀케어를 쓰지 않는 사람도 교인 명단에 이메일이 있어야 로그인할 수 있습니다. 셀케어 앱의 「등록 신청하기」로 신청하고 셀케어 관리자가 승인하면, 보고 앱에서 같은 이메일로 로그인할 수 있습니다. 셀케어 권한(셀 보고 등)은 셀케어에서 따로 주지 않는 한 생기지 않습니다.

## 권한 테스트

DB 권한 규칙은 로컬에서 실제 Postgres(PGlite)로 검증할 수 있습니다.

```
npm run test:db
```
