-- 예배위원은 예배 종류·날짜별 공통 정보이며 보고서/개인 비공개 내용과 별도다.
create table report.worship_staff(
 service_id uuid not null references report.service_types(id),held_on date not null,
 staff text not null default '' check(char_length(staff)<=4000),
 created_by uuid not null references report.profiles(id),updated_by uuid not null references report.profiles(id),updated_at timestamptz not null default now(),
 primary key(service_id,held_on));
alter table report.worship_staff enable row level security;
revoke all on report.worship_staff from public,anon,authenticated;
grant select,insert on report.worship_staff to authenticated;
grant update(staff,updated_by) on report.worship_staff to authenticated;
create policy worship_staff_read on report.worship_staff for select to authenticated using(report.is_active_user());
create policy worship_staff_add on report.worship_staff for insert to authenticated with check(report.is_active_user() and report.is_clergy() and created_by=auth.uid() and updated_by=auth.uid());
create policy worship_staff_change on report.worship_staff for update to authenticated using(report.is_active_user() and report.is_clergy()) with check(report.is_active_user() and report.is_clergy() and updated_by=auth.uid());
create function report.validate_worship_staff() returns trigger language plpgsql set search_path='' as $$
begin
 if not report.is_active_user() or not report.is_clergy() then raise exception 'clergy required' using errcode='42501';end if;
 if not exists(select 1 from report.service_types where id=new.service_id and is_active) then raise exception 'active service required';end if;
 if TG_OP='INSERT' then new.created_by=auth.uid();end if;
 new.updated_by=auth.uid();new.updated_at=clock_timestamp();return new;
end $$;
revoke all on function report.validate_worship_staff() from public,anon,authenticated;
create trigger worship_staff_validate before insert or update on report.worship_staff for each row execute function report.validate_worship_staff();
