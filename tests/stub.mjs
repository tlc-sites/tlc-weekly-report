// Supabase가 기본으로 제공하는 역할, auth 스키마, 기본 권한과
// 같은 프로젝트를 쓰는 셀케어의 교인 명단(public.profiles)을 흉내 낸다
export const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  create table public.profiles (id uuid primary key default gen_random_uuid(), name text not null,
    email text, auth_user_id uuid, active boolean not null default true);
`;
