-- 2단계: 관리자 도구 (그룹 계층 검사, 소속 일괄 변경, 관리자 지정)

-- 그룹은 2단계 계층(상위 그룹 아래 하위 그룹)만 허용하고, 하위 그룹은 상위 그룹과 유형이 같아야 한다
create function report.validate_group() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_parent report.groups;
begin
  if new.parent_id is not null then
    select * into v_parent from report.groups where id = new.parent_id;
    if v_parent.id is null then
      raise exception '상위 그룹을 찾을 수 없습니다.';
    end if;
    if v_parent.parent_id is not null then
      raise exception '하위 그룹 아래에는 그룹을 만들 수 없습니다.';
    end if;
    if v_parent.type <> new.type then
      raise exception '상위 그룹과 유형이 같아야 합니다.';
    end if;
    if tg_op = 'UPDATE' and exists (select 1 from report.groups c where c.parent_id = new.id) then
      raise exception '하위 그룹이 있는 그룹은 다른 그룹 아래로 옮길 수 없습니다.';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.type <> old.type
     and exists (select 1 from report.groups c where c.parent_id = new.id) then
    raise exception '하위 그룹이 있는 그룹은 유형을 바꿀 수 없습니다.';
  end if;
  return new;
end;
$$;
create trigger groups_validate before insert or update of parent_id, type on report.groups
  for each row execute function report.validate_group();

-- 사용자의 소속과 역할을 통째로 바꾼다 (관리자 전용)
create function report.set_memberships(p_user uuid, p_assignments jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  a jsonb;
begin
  if not report.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(p_assignments) <> 'array' then
    raise exception 'assignments must be an array';
  end if;
  if not exists (select 1 from report.profiles where id = p_user) then
    raise exception 'user not found';
  end if;

  delete from report.memberships where user_id = p_user;
  for a in select * from jsonb_array_elements(p_assignments) loop
    insert into report.memberships (user_id, group_id, role)
    values (p_user, (a ->> 'group_id')::uuid, (a ->> 'role')::report.member_role)
    on conflict (user_id, group_id) do update set role = excluded.role;
  end loop;
end;
$$;

-- 관리자 지정·해제. 자기 자신의 관리자 권한은 해제할 수 없다 (관리자가 0명이 되는 것을 막음)
create function report.set_user_admin(p_user uuid, p_is_admin boolean)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not report.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user = auth.uid() and not p_is_admin then
    raise exception 'cannot remove own admin';
  end if;
  update report.profiles set is_admin = p_is_admin where id = p_user and status = 'active';
  if not found then
    raise exception 'active user not found';
  end if;
end;
$$;

revoke execute on function report.set_memberships(uuid, jsonb) from public, anon;
revoke execute on function report.set_user_admin(uuid, boolean) from public, anon;
grant execute on function report.set_memberships(uuid, jsonb) to authenticated;
grant execute on function report.set_user_admin(uuid, boolean) to authenticated;
