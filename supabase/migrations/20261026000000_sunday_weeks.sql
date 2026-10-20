-- 날짜 원본은 그대로 두고 소속 주차만 시작 일요일로 재계산한다 (PostgreSQL 17+).
alter table report.reports alter column week
set expression as (meeting_date - extract(dow from meeting_date)::int);

-- week_status의 일요일 날짜는 해당 주일의 표시로 보존한다.
-- 기존 알림 로그 역시 발송 이력으로 보존하며 새 크론 슬롯과 섞지 않는다.
create function report.prevent_future_report_date() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if TG_OP='INSERT' or new.meeting_date is distinct from old.meeting_date then
    if new.meeting_date > (now() at time zone 'Asia/Seoul')::date then
      raise exception '미래 날짜의 사역 보고는 작성할 수 없습니다';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function report.prevent_future_report_date() from public,anon;
create trigger prevent_future_report_date before insert or update of meeting_date on report.reports
for each row execute function report.prevent_future_report_date();

-- 현재 실행 일정은 vercel.json/코드가 사용하며, 보관된 운영 설정도 동일하게 맞춘다.
insert into report.app_settings(key,value) values
 ('deadline','{"weekday":5,"time":"17:00"}'),
 ('reminders','{"first_weekday":3,"first":"09:00","second_weekday":5,"second":"09:00","meeting_weekday":5,"meeting_digest":"17:00"}')
on conflict(key) do update set value=excluded.value;
