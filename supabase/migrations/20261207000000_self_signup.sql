-- DB47 보고 앱 자체 가입: 셀케어를 쓰지 않는 분도 이 앱 로그인 화면에서 이메일로 가입 신청하고 바로 로그인 코드를 받는다.
-- 로그인 뒤에는 기존처럼 이름·파트 신청(onboarding) → 관리자 승인을 거쳐야 보고서를 쓸 수 있다.
-- 셀케어 명단(public.profiles)에는 넣지 않는다. 셀케어에 들어가면 '아직 등록되지 않은 계정'으로만 보인다.
create table if not exists report.signup_requests(
 email text primary key check(email=lower(email) and char_length(email)<=200),
 status text not null default 'pending' check(status in('pending','rejected')),
 created_at timestamptz not null default now(),
 last_requested_at timestamptz not null default now());
alter table report.signup_requests enable row level security;
revoke all on report.signup_requests from public,anon,authenticated;

-- 로그인 화면의 서버 액션이 service_role로만 부른다(로그인 전 anon에게 report 스키마를 열지 않는다). 이미 신청한 이메일은 새로 쌓지 않고, 거절된 이메일은 그대로 막힌다(답은 같음).
create or replace function report.request_signup(p_email text) returns text
language plpgsql security definer set search_path='' as $$
declare v text:=lower(btrim(coalesce(p_email,'')));
begin
 if char_length(v)>200 or v!~'^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'invalid email' using errcode='22023'; end if;
 if exists(select 1 from report.signup_requests where email=v) then
  update report.signup_requests set last_requested_at=now() where email=v and status='pending';
  return 'ok';
 end if;
 -- 너무 많은 신청 막기: 전체 1시간 30건
 if (select count(*) from report.signup_requests where created_at>now()-interval '1 hour')>=30 then
  raise exception 'too many sign-up requests' using errcode='P0429';
 end if;
 insert into report.signup_requests(email) values(v) on conflict do nothing;
 return 'ok';
end $$;
revoke all on function report.request_signup(text) from public,anon,authenticated;
grant execute on function report.request_signup(text) to service_role;

-- 셀케어의 가입 차단(auth.users 트리거 함수)을 넓힌다: 셀케어 명단에 있는 이메일(기존 그대로)이거나,
-- 이 앱에서 가입 신청해 대기 중인 이메일이면 통과. 운영 본문(2026-11-07 조회)에 조건 하나만 더했다.
create or replace function private.gate_new_auth_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'private', 'pg_temp'
as $function$
begin
  if new.email is null or not (
       exists (select 1 from public.profiles where lower(email) = lower(new.email) and active)
       or exists (select 1 from report.signup_requests s where s.email = lower(new.email) and s.status = 'pending')) then
    raise exception 'CELLCARE_NOT_APPROVED' using errcode = 'P0403';
  end if;
  return new;
end $function$;
