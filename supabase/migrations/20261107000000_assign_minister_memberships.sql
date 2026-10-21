-- 교역자 직책 선택과 역할 지정을 한 번의 저장으로 처리한다.
create function report.set_memberships_with_minister(p_user uuid,p_assignments jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not report.is_admin() then raise exception 'forbidden' using errcode='42501'; end if;
 if p_user=auth.uid() and not report.is_senior() then raise exception 'cannot change own content assignments' using errcode='42501'; end if;
 if p_assignments is null or jsonb_typeof(p_assignments)<>'array' then raise exception 'assignments must be an array'; end if;
 perform 1 from report.profiles where id=p_user and status='active' for update;
 if not found then raise exception 'active user required'; end if;
 if exists(select 1 from jsonb_array_elements(p_assignments) x where x->>'position' in('교역자','담당교역자'))
 and exists(select 1 from report.profiles where id=p_user and not is_minister and recipient_role is null) then
  perform report.set_minister(p_user,true);
 end if;
 perform report.set_memberships(p_user,p_assignments);
end $$;
revoke all on function report.set_memberships_with_minister(uuid,jsonb) from public,anon;
grant execute on function report.set_memberships_with_minister(uuid,jsonb) to authenticated;
