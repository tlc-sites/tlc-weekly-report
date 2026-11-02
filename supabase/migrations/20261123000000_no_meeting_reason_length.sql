-- 모임 없음 사유를 여러 줄로 적을 수 있게 100자에서 1000자로 늘린다.
alter table report.week_status drop constraint if exists week_status_reason_check;
alter table report.week_status add constraint week_status_reason_check check (char_length(reason) <= 1000);
