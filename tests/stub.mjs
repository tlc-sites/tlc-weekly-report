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
  -- 셀케어의 가입 차단 함수(운영 본문). 트리거는 붙이지 않는다(필요한 테스트가 직접 붙인다).
  create schema private;
  create function private.gate_new_auth_user() returns trigger language plpgsql security definer
    set search_path to 'public', 'private', 'pg_temp' as $f$
  begin
    if new.email is null or not exists (
         select 1 from public.profiles where lower(email) = lower(new.email) and active) then
      raise exception 'CELLCARE_NOT_APPROVED' using errcode = 'P0403';
    end if;
    return new;
  end $f$;
  -- Supabase Storage: 버킷과 파일 메타데이터 표 (파일 내용은 다루지 않는다)
  create schema storage;
  create table storage.buckets (id text primary key, name text not null, public boolean not null default false,
    file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id),
    name text not null, owner uuid default auth.uid(), created_at timestamptz not null default now(), unique (bucket_id, name));
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated, service_role;
  grant select on storage.buckets to authenticated;
  grant all on storage.objects to authenticated, service_role;
`;
