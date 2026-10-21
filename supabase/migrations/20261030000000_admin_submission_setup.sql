-- 관리 현황과 내용 열람을 분리한다. 임시 열람 대상/기간은 운영 승인 후 별도로 등록한다.
create table report.setup_access_grants (
  user_id uuid primary key references report.profiles(id) on delete cascade,
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  check(expires_at > starts_at and expires_at <= starts_at + interval '14 days')
);
alter table report.setup_access_grants enable row level security;
revoke all on report.setup_access_grants from public,anon,authenticated;
grant select on report.setup_access_grants to authenticated;
grant all on report.setup_access_grants to service_role;
create policy setup_access_self on report.setup_access_grants for select to authenticated
  using(user_id=auth.uid() and report.is_active_user());
create function report.has_setup_access() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from report.profiles p join report.setup_access_grants g on g.user_id=p.id
    where p.id=auth.uid() and p.status='active' and p.is_admin
      and g.starts_at<=now() and now()<g.expires_at);
$$;
revoke all on function report.has_setup_access() from public,anon;
grant execute on function report.has_setup_access() to authenticated;

create policy reports_setup_read on report.reports for select to authenticated using(report.has_setup_access());
create policy incidents_setup_read on report.worship_incidents for select to authenticated using(report.has_setup_access());
-- 화면과 하위 일반 내용 정책도 같은 만료 검사를 사용한다. 수정/확인/비공개 정책은 바꾸지 않는다.
do $$ declare body text; signature text; begin
  foreach signature in array array['report.can_view_report(uuid)','report.can_view_group(uuid)','report.can_view_incident(uuid)'] loop
    body=pg_get_functiondef(signature::regprocedure);
    if position('report.is_senior()' in body)=0 then raise exception 'unexpected access function: %',signature; end if;
    body=replace(body,'report.is_senior()','(report.is_senior() or report.has_setup_access())');
    execute body;
  end loop;
end $$;

-- 본문·비공개·명단·연락처·모임 없음 사유를 반환하지 않는 관리자 전용 현황이다.
create function report.admin_submission_status(p_week date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not report.is_admin() then raise exception 'forbidden' using errcode='42501'; end if;
  if p_week is null or extract(dow from p_week)<>0 or p_week > ((now() at time zone 'Asia/Seoul')::date - extract(dow from now() at time zone 'Asia/Seoul')::int) then
    raise exception 'invalid report week';
  end if;
  select jsonb_build_object(
    'groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'type',g.type,'schedule',g.schedule) order by g.sort_order,g.name)
      from report.groups g where g.is_active and not exists(select 1 from report.groups child where child.parent_id=g.id and child.is_active)),'[]'::jsonb),
    'reports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'group_id',r.group_id,'author_id',r.author_id,'author_name',r.author_name,
      'meeting_date',r.meeting_date,'meeting_label',r.meeting_label,'status',r.status,'submitted_at',r.submitted_at,
      'service',case when s.id is not null then jsonb_build_object('name',s.name) else null end,
      'meeting',case when m.id is not null then jsonb_build_object('name',m.name) else null end,
      'can_open',report.can_view_report(r.id)) order by r.updated_at desc)
      from report.reports r left join report.service_types s on s.id=r.service_type_id left join report.group_meeting_types m on m.id=r.group_meeting_type_id
      where r.week=p_week),'[]'::jsonb),
    'no_meeting',coalesce((select jsonb_agg(w.group_id) from report.week_status w where w.week=p_week and w.no_meeting),'[]'::jsonb),
    'setup_expires_at',(select g.expires_at from report.setup_access_grants g where g.user_id=auth.uid() and report.has_setup_access())
  ) into result;
  return result;
end;
$$;
revoke all on function report.admin_submission_status(date) from public,anon;
grant execute on function report.admin_submission_status(date) to authenticated;
