-- 자동저장은 작성자 전용으로 보관하며 실제 명단·출결·제출에는 영향을 주지 않는다.
create table report.report_drafts(
 report_id uuid primary key references report.reports(id) on delete cascade,
 author_id uuid not null references report.profiles(id),payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=262144),
 report_updated_at timestamptz not null,updated_at timestamptz not null default clock_timestamp());
alter table report.report_drafts enable row level security;
revoke all on report.report_drafts from public,anon,authenticated;
grant select on report.report_drafts to authenticated;
create policy draft_owner_read on report.report_drafts for select to authenticated using(report.is_active_user() and author_id=auth.uid());
create function report.autosave_report(p_report uuid,p_expected_updated_at timestamptz,p_payload jsonb) returns timestamptz
language plpgsql security definer set search_path='' as $$
declare existing report.reports; saved_at timestamptz; current_version timestamptz; base_version timestamptz;
begin
 if not report.is_active_user() then raise exception 'forbidden' using errcode='42501';end if;
 select * into existing from report.reports where id=p_report for update;
 if not found or existing.author_id<>auth.uid() or not report.can_edit_report(p_report) then raise exception 'forbidden' using errcode='42501';end if;
 if existing.status<>'draft' then raise exception 'autosave requires draft';end if;
 select updated_at,report_updated_at into current_version,base_version from report.report_drafts where report_id=p_report;
 if base_version is not null and base_version<>existing.updated_at then raise exception 'autosave conflict';end if;
 current_version=coalesce(current_version,existing.updated_at);
 if p_expected_updated_at is null or current_version<>p_expected_updated_at then raise exception 'autosave conflict';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>262144 then raise exception 'invalid draft payload';end if;
 if jsonb_typeof(p_payload->'newcomers')='array' and exists(select 1 from jsonb_array_elements(p_payload->'newcomers') n where coalesce(btrim(n->>'guardian_contact'),'')<>'' and coalesce(n->>'consent','false')<>'true') then raise exception 'guardian consent required';end if;
 insert into report.report_drafts(report_id,author_id,payload,report_updated_at) values(p_report,auth.uid(),p_payload,existing.updated_at)
 on conflict(report_id) do update set payload=excluded.payload,updated_at=clock_timestamp()
 returning updated_at into saved_at;
 return saved_at;
end $$;
revoke all on function report.autosave_report(uuid,timestamptz,jsonb) from public,anon;
grant execute on function report.autosave_report(uuid,timestamptz,jsonb) to authenticated;
-- 실제 저장/제출이 성공한 트랜잭션에서만 자동저장 사본을 제거한다.
create function report.save_report_from_draft(p_report uuid,p_payload jsonb,p_status report.report_status,p_expected_draft_updated_at timestamptz default null) returns void
language plpgsql set search_path='' as $$
declare existing report.reports; current_version timestamptz;
begin
 select * into existing from report.reports where id=p_report for update;
 if not found then raise exception 'forbidden' using errcode='42501';end if;
 if p_expected_draft_updated_at is not null and existing.status<>'draft' then raise exception 'autosave conflict';end if;
 if existing.author_id=auth.uid() and existing.status='draft' then
  select updated_at into current_version from report.report_drafts where report_id=p_report;
  current_version=coalesce(current_version,existing.updated_at);
  if p_expected_draft_updated_at is null or current_version<>p_expected_draft_updated_at then raise exception 'autosave conflict';end if;
 end if;
 perform report.save_report(p_report,p_payload,p_status);
 if existing.author_id=auth.uid() then perform report.clear_own_report_draft(p_report);end if;
end $$;
create function report.clear_own_report_draft(p_report uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not report.is_active_user() or not exists(select 1 from report.reports where id=p_report and author_id=auth.uid()) then raise exception 'forbidden' using errcode='42501';end if;
 delete from report.report_drafts where report_id=p_report and author_id=auth.uid();
end $$;
revoke all on function report.clear_own_report_draft(uuid) from public,anon;
grant execute on function report.clear_own_report_draft(uuid) to authenticated;
revoke all on function report.save_report_from_draft(uuid,jsonb,report.report_status,timestamptz) from public,anon;
grant execute on function report.save_report_from_draft(uuid,jsonb,report.report_status,timestamptz) to authenticated;
