-- 주간 보고와 독립적으로 추적하며 여러 팀이 같은 경위서를 공유한다.
create table report.worship_incidents (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references report.profiles(id),
  report_id uuid references report.reports(id),
  group_ids uuid[] not null check (cardinality(group_ids) between 1 and 10 and array_position(group_ids,null) is null),
  occurred_on date not null,
  service_id uuid references report.service_types(id),
  service_name text not null check (char_length(btrim(service_name)) between 1 and 100),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  pastor text not null default '' check (char_length(pastor)<=100),
  participants text not null default '' check (char_length(participants)<=500),
  circumstances text not null check (char_length(btrim(circumstances)) between 1 and 3000),
  cause text not null default '' check (char_length(cause)<=2000),
  response text not null default '' check (char_length(response)<=2000),
  prevention text not null default '' check (char_length(prevention)<=2000),
  follow_up_owner text not null default '' check (char_length(follow_up_owner)<=100),
  due_on date,
  status text not null default 'open' check (status in ('open','temporary','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index worship_incidents_open_idx on report.worship_incidents(status,occurred_on desc);
create index worship_incidents_report_idx on report.worship_incidents(report_id);
alter table report.worship_incidents enable row level security;
revoke all on report.worship_incidents from anon,authenticated;
grant select,insert,update on report.worship_incidents to authenticated;

create function report.can_read_incident(owner_id uuid, related uuid[]) returns boolean
language sql stable security definer set search_path='' as $$
  select report.is_active_user() and (owner_id=auth.uid() or report.is_admin() or exists (
    select 1 from unnest(related) gid where report.can_review_group(gid)
  ));
$$;
revoke all on function report.can_read_incident(uuid,uuid[]) from public,anon;
grant execute on function report.can_read_incident(uuid,uuid[]) to authenticated;

create policy incidents_read on report.worship_incidents for select to authenticated
using (report.can_read_incident(author_id,group_ids));
create policy incidents_insert on report.worship_incidents for insert to authenticated
with check (report.is_active_user() and author_id=auth.uid() and (
  report.is_admin() or exists(select 1 from unnest(group_ids) gid where report.can_write_group(gid))
));
create policy incidents_update on report.worship_incidents for update to authenticated
using (report.can_read_incident(author_id,group_ids))
with check (report.can_read_incident(author_id,group_ids));

create function report.validate_worship_incident() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if TG_OP='UPDATE' then
    if (new.id,new.author_id,new.report_id,new.group_ids,new.occurred_on,new.service_id,new.service_name,new.created_at)
       is distinct from (old.id,old.author_id,old.report_id,old.group_ids,old.occurred_on,old.service_id,old.service_name,old.created_at) then
      raise exception '등록 당시의 관련 정보는 변경할 수 없습니다';
    end if;
  else
    if new.occurred_on > (now() at time zone 'Asia/Seoul')::date then
      raise exception '미래 날짜는 등록할 수 없습니다';
    end if;
    if cardinality(new.group_ids)<>(select count(distinct gid) from unnest(new.group_ids) gid)
       or exists(select 1 from unnest(new.group_ids) gid where not exists (
         select 1 from report.groups g where g.id=gid and g.type='worship' and g.is_active
           and not exists(select 1 from report.groups c where c.parent_id=g.id and c.is_active)
       )) then raise exception '관련 파트는 사용 중인 예배·기술팀을 선택해 주세요'; end if;
    if new.service_id is not null then
      select name into new.service_name from report.service_types where id=new.service_id and is_active;
      if not found then raise exception '사용 중인 예배를 선택해 주세요'; end if;
    end if;
    if new.report_id is not null and not exists (
      select 1 from report.reports r where r.id=new.report_id and report.can_view_report(r.id)
        and r.group_id=any(new.group_ids) and r.meeting_date=new.occurred_on
        and r.service_type_id is not distinct from new.service_id
    ) then raise exception '연결할 보고와 예배 정보가 일치하지 않습니다'; end if;
  end if;
  if new.status='resolved' and (btrim(new.response)='' or btrim(new.prevention)='') then
    raise exception '해결 시 대응 결과와 개선대책을 적어 주세요';
  end if;
  new.updated_at=now();
  return new;
end;
$$;
revoke all on function report.validate_worship_incident() from public,anon;
create trigger validate_worship_incident before insert or update on report.worship_incidents
for each row execute function report.validate_worship_incident();
