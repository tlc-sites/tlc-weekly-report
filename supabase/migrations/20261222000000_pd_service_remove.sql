-- DB 62: 잘못 만든 PD 체크리스트 예배를 목록에서
-- 지운다(관리자). 템플릿·회차 기록은 지우지 않고
-- 지운 예배 표에만 적어 두어, 편집 화면에서 다시
-- 되살릴 수 있다. 기본 네 예배(1부·2부·3부·라이프
-- 라인)는 지울 수 없다.
-- 채팅에서 복사해 SQL Editor에 넣으므로 줄을 짧게 둔다.
create table if not exists
 report.pd_service_removed(
  service_key text primary key,
  removed_at timestamptz not null
   default now(),
  removed_by uuid
   references report.profiles(id)
   on delete set null);
alter table report.pd_service_removed
 enable row level security;
revoke all on report.pd_service_removed
 from public, anon, authenticated;
grant select on report.pd_service_removed
 to authenticated;
drop policy if exists pd_service_removed_read
 on report.pd_service_removed;
create policy pd_service_removed_read
 on report.pd_service_removed
 for select to authenticated
 using (report.is_active_user());

-- 지우기: p_remove=true, 되살리기: false
create or replace function
 report.pd_service_set_removed(
  p_service text, p_remove boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
 if not report.is_admin() then
  raise exception 'admin required'
   using errcode = '42501';
 end if;
 if p_service in
   ('sun1','sun2','sun3','life') then
  raise exception 'base service'
   using errcode = '22023';
 end if;
 if not exists(
   select 1 from report.pd_templates
   where service_key = p_service) then
  raise exception 'no service'
   using errcode = '22023';
 end if;
 if p_remove then
  insert into report.pd_service_removed(
    service_key, removed_by)
   values (p_service, auth.uid())
   on conflict (service_key) do nothing;
 else
  delete from report.pd_service_removed
   where service_key = p_service;
 end if;
end $$;
revoke all on function
 report.pd_service_set_removed(text, boolean)
 from public, anon;
grant execute on function
 report.pd_service_set_removed(text, boolean)
 to authenticated;
