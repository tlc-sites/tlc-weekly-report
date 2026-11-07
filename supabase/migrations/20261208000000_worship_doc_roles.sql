-- DB48 주일예배 큐시트·PD 체크리스트 작성자 지정. 관리자(담임 포함)가 사용자 화면에서 '큐시트 작성'·'PD 체크리스트 작성'을 켠다.
-- 한 역할에 지정된 사람이 한 명도 없으면 지금처럼 승인된 누구나 고친다(지정하는 순간부터 제한). 관리자는 언제나 고친다.
-- 큐시트와 PD 체크리스트는 같은 회차(pd_runs)를 쓴다. 겹치는 칸(담당자·송리스트 roster, PD 이름, 성찬 등 조건)은 둘 중 하나만 있어도,
-- 체크·리포트(checks·report)는 PD 작성자만 고친다. 저장 함수는 그대로 두고 회차 표에 들어가기 직전에 검사한다.
create table if not exists report.worship_doc_roles(
 user_id uuid not null references report.profiles(id) on delete cascade,
 role text not null check(role in('cue','pd')),
 granted_by uuid references report.profiles(id) on delete set null default auth.uid(),
 created_at timestamptz not null default now(),
 primary key(user_id,role));
alter table report.worship_doc_roles enable row level security;
revoke all on report.worship_doc_roles from public,anon,authenticated;
grant select,insert,delete on report.worship_doc_roles to authenticated;
drop policy if exists worship_doc_roles_read on report.worship_doc_roles;
create policy worship_doc_roles_read on report.worship_doc_roles for select to authenticated using(report.is_active_user());
drop policy if exists worship_doc_roles_add on report.worship_doc_roles;
create policy worship_doc_roles_add on report.worship_doc_roles for insert to authenticated
 with check(report.is_admin() and exists(select 1 from report.profiles p where p.id=user_id and p.status='active'));
drop policy if exists worship_doc_roles_remove on report.worship_doc_roles;
create policy worship_doc_roles_remove on report.worship_doc_roles for delete to authenticated using(report.is_admin());

create or replace function report.can_write_worship_doc(kind text) returns boolean
language sql stable security definer set search_path='' as $$
 select report.is_active_user() and (report.is_admin()
  or not exists(select 1 from report.worship_doc_roles r join report.profiles p on p.id=r.user_id and p.status='active' where r.role=kind)
  or exists(select 1 from report.worship_doc_roles r where r.role=kind and r.user_id=auth.uid()));
$$;
revoke all on function report.can_write_worship_doc(text) from public,anon;
grant execute on function report.can_write_worship_doc(text) to authenticated;

create or replace function report.pd_runs_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- 로그인 사용자가 아닌 작업(서버·SQL Editor)은 막지 않는다.
 if auth.uid() is null then return new; end if;
 if TG_OP='UPDATE' and (new.checks is distinct from old.checks or new.report is distinct from old.report)
    and not report.can_write_worship_doc('pd') then
  raise exception 'pd checklist writer required' using errcode='42501';
 end if;
 if (TG_OP='INSERT' or new.roster is distinct from old.roster or new.conditions is distinct from old.conditions or new.pd_name is distinct from old.pd_name)
    and not (report.can_write_worship_doc('cue') or report.can_write_worship_doc('pd')) then
  raise exception 'cue sheet or pd checklist writer required' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function report.pd_runs_guard() from public,anon,authenticated;
drop trigger if exists pd_runs_guard on report.pd_runs;
create trigger pd_runs_guard before insert or update on report.pd_runs for each row execute function report.pd_runs_guard();
