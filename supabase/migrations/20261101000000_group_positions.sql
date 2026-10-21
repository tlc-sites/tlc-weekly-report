-- 직책 이름은 파트마다 다르며, 교역자 권한은 그 파트의 교역자 직책에만 연결한다.
insert into report.groups(type,name,schedule,settings,sort_order)
select 'worship','사진팀','irregular','{}',95 where not exists(select 1 from report.groups where name='사진팀');
insert into report.group_service_types(group_id,service_type_id)
select g.id,s.id from report.groups g cross join report.service_types s where g.name='사진팀' and s.is_active on conflict do nothing;
alter table report.memberships add column position text;
create function report.positions_for_group(gid uuid) returns table(title text,member_role report.member_role,is_clergy boolean)
language sql stable security definer set search_path='' as $$
  select t.title,(case when t.title in ('교역자','담당교역자','총괄','예배총괄','팀장','부팀장') then 'reviewer' else 'writer' end)::report.member_role,
    t.title in ('교역자','담당교역자')
  from report.groups g cross join lateral unnest(case
    when g.type='education' then array['교역자','총괄']
    when g.type='other' and coalesce(g.settings->>'report_category','')<>'internship' then array['총괄','담임','파트']
    when g.name='예배팀' then array['담당교역자','예배인도자']
    when g.name in ('음향팀','조명팀','자막팀') then array['담당교역자','오퍼레이터']
    when g.name='영상팀' then array['담당교역자','예배총괄','팀장','부팀장']
    else array['담당교역자'] end) t(title) where g.id=gid;
$$;
revoke all on function report.positions_for_group(uuid) from public,anon;
grant execute on function report.positions_for_group(uuid) to authenticated;
create function report.validate_membership_position() returns trigger
language plpgsql security definer set search_path='' as $$
declare choice record; begin
  if new.position is null then
    if TG_OP='UPDATE' and old.position is not null then raise exception 'position required'; end if;
    if new.role='reviewer' and exists(select 1 from report.profiles where id=new.user_id and is_minister) then
      if TG_OP='INSERT' then raise exception 'position required';
      elsif old.role is distinct from new.role then raise exception 'position required'; end if;
    end if;
    return new;
  end if;
  select * into choice from report.positions_for_group(new.group_id) where title=new.position;
  if not found or choice.member_role<>new.role then raise exception 'invalid group position'; end if;
  if choice.is_clergy and not exists(select 1 from report.profiles where id=new.user_id and (is_minister or recipient_role is not null)) then
    raise exception 'minister role required' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function report.validate_membership_position() from public,anon;
create trigger memberships_position before insert or update on report.memberships for each row execute function report.validate_membership_position();

create or replace function report.assigned_clergy(gid uuid) returns boolean
language sql stable security definer set search_path='' as $$
  with recursive chain(id,parent_id) as (
    select id,parent_id from report.groups where id=gid union
    select g.id,g.parent_id from report.groups g join chain c on g.id=c.parent_id
  ) select report.is_clergy() and exists(select 1 from report.memberships m join chain c on c.id=m.group_id
    where m.user_id=auth.uid() and ((m.position is null and m.role='reviewer') or m.position in ('교역자','담당교역자')));
$$;
-- 한 사람이 파트마다 다른 직급을 맡을 수 있다. 새 보고는 해당 파트 직급을 보존한다.
create function report.group_content_layer(p_user uuid,gid uuid) returns integer
language sql stable security definer set search_path='' as $$
  with recursive chain(id,parent_id) as (
    select id,parent_id from report.groups where id=gid union
    select g.id,g.parent_id from report.groups g join chain c on g.id=c.parent_id
  ) select coalesce((select case when p.recipient_role is not null then 4 else coalesce((
    select max(case when (p.is_minister and (m.position in ('교역자','담당교역자') or (m.position is null and m.role='reviewer'))) then 3
      when m.role='reviewer' then 2 else 1 end)
    from report.memberships m join chain c on c.id=m.group_id where m.user_id=p.id),0) end
    from report.profiles p where p.id=p_user and p.status='active'),0);
$$;
revoke all on function report.group_content_layer(uuid,uuid) from public,anon;
grant execute on function report.group_content_layer(uuid,uuid) to authenticated;
create or replace function report.same_content_layer(layer integer) returns boolean
language sql stable security definer set search_path='' as $$
  select report.is_active_user() and layer>0 and (
    (layer=4 and report.is_senior()) or (layer=3 and report.is_clergy()) or
    exists(select 1 from report.memberships m where m.user_id=auth.uid() and report.group_content_layer(auth.uid(),m.group_id)=layer));
$$;
create or replace function report.stamp_content_layer() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if TG_OP='INSERT' then
    if TG_TABLE_NAME='reports' then new.author_layer=report.group_content_layer(new.author_id,new.group_id);
    else new.author_layer=report.group_content_layer(new.author_id,new.group_ids[1]); end if;
  else new.author_layer=old.author_layer; end if;
  return new;
end;
$$;
-- 기존 미분류 소속은 갱신으로 보존하고, 제출 목록에서 뺀 파트만 해제한다.
create or replace function report.set_memberships(p_user uuid,p_assignments jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare a jsonb; begin
  if not report.is_admin() then raise exception 'forbidden' using errcode='42501'; end if;
  if p_user=auth.uid() and not report.is_senior() then raise exception 'cannot change own content assignments' using errcode='42501'; end if;
  if jsonb_typeof(p_assignments)<>'array' or p_assignments is null then raise exception 'assignments must be an array'; end if;
  if not exists(select 1 from report.profiles where id=p_user) then raise exception 'user not found'; end if;
  if exists(select 1 from jsonb_array_elements(p_assignments) x group by x->>'group_id' having count(*)>1) then raise exception 'duplicate group assignment'; end if;
  for a in select * from jsonb_array_elements(p_assignments) loop
    if a->>'role' not in ('writer','reviewer') or a->>'role' is null then raise exception 'invalid group position'; end if;
    if exists(select 1 from report.memberships where user_id=p_user and group_id=(a->>'group_id')::uuid) then
      update report.memberships set role=(a->>'role')::report.member_role,position=nullif(a->>'position','') where user_id=p_user and group_id=(a->>'group_id')::uuid;
    else
      insert into report.memberships(user_id,group_id,role,position) values(p_user,(a->>'group_id')::uuid,(a->>'role')::report.member_role,nullif(a->>'position',''));
    end if;
  end loop;
  delete from report.memberships m where m.user_id=p_user and not exists(select 1 from jsonb_array_elements(p_assignments) submitted(value) where (submitted.value->>'group_id')::uuid=m.group_id);
end;
$$;
create or replace function report.approve_user(p_user uuid,p_assignments jsonb,p_make_admin boolean default false) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not report.is_admin() then raise exception 'forbidden' using errcode='42501'; end if;
  if jsonb_typeof(p_assignments)<>'array' or p_assignments is null then raise exception 'assignments must be an array'; end if;
  update report.profiles set status='active',is_admin=p_make_admin or is_admin,approved_at=now(),approved_by=auth.uid() where id=p_user;
  if not found then raise exception 'user not found'; end if;
  perform report.set_memberships(p_user,p_assignments);
end;
$$;
