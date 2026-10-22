-- 열람 기록은 검토 완료 처리와 분리하고 실제 최상단 계정만 남긴다.
create table report.senior_report_reads(
 report_id uuid not null references report.reports(id) on delete cascade,
 recipient_role text not null check(recipient_role in('pastor','pastor_wife')),
 viewer_id uuid not null references report.profiles(id),
 report_version timestamptz not null,
 viewed_at timestamptz not null default clock_timestamp(),
 primary key(report_id,recipient_role)
);
alter table report.senior_report_reads enable row level security;
revoke all on report.senior_report_reads from public,anon,authenticated;
grant select on report.senior_report_reads to authenticated;
create policy senior_reads_visible on report.senior_report_reads for select to authenticated
 using(report.can_view_report(report_id));
create function report.mark_senior_report_read(p_report uuid,p_version timestamptz) returns timestamptz
language plpgsql security definer set search_path='' as $$
declare senior_role text; current_version timestamptz; current_status text; seen timestamptz;
begin
 if not report.is_senior() then raise exception 'senior required' using errcode='42501'; end if;
 select recipient_role into senior_role from report.profiles where id=auth.uid() and status='active';
 select updated_at,status into current_version,current_status from report.reports where id=p_report for share;
 if not found or current_status='draft' or not report.can_view_report(p_report) then raise exception 'submitted report required'; end if;
 if p_version is distinct from current_version then raise exception 'report version changed'; end if;
 insert into report.senior_report_reads(report_id,recipient_role,viewer_id,report_version)
 values(p_report,senior_role,auth.uid(),current_version)
 on conflict(report_id,recipient_role) do update set viewer_id=excluded.viewer_id,report_version=excluded.report_version,viewed_at=clock_timestamp()
 where senior_report_reads.report_version is distinct from excluded.report_version or senior_report_reads.viewer_id is distinct from excluded.viewer_id;
 select viewed_at into seen from report.senior_report_reads where report_id=p_report and recipient_role=senior_role;
 return seen;
end $$;
revoke all on function report.mark_senior_report_read(uuid,timestamptz) from public,anon;
grant execute on function report.mark_senior_report_read(uuid,timestamptz) to authenticated;
