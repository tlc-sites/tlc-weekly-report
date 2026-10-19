-- 5차: 웹 푸시 구독 저장, 관리자용 알림 설정 현황

-- 구독 저장. 같은 기기(endpoint)를 전에 다른 사람이 구독했어도 지금 로그인한 사람의 것으로 바꾼다.
create function report.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_device_label text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not report.is_active_user() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000 or char_length(p_p256dh) > 200 or char_length(p_auth) > 100 then
    raise exception 'invalid subscription';
  end if;

  delete from report.push_subscriptions where endpoint = p_endpoint;
  insert into report.push_subscriptions (user_id, endpoint, p256dh, auth, device_label)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_device_label, 100));
end;
$$;

-- 관리자: 사용자별 알림 기기 수 (알림 미설정자 확인용)
create function report.push_status()
returns table (user_id uuid, real_name text, devices int, last_success_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.real_name, count(s.id)::int, max(s.last_success_at)
    from report.profiles p
    left join report.push_subscriptions s on s.user_id = p.id
   where p.status = 'active' and report.is_admin()
   group by p.id, p.real_name
   order by p.real_name;
$$;

revoke execute on function report.save_push_subscription(text, text, text, text) from public, anon;
revoke execute on function report.push_status() from public, anon;
grant execute on function report.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function report.push_status() to authenticated;
