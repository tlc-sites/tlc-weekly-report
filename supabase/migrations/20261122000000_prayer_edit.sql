-- 주중 기도회 보고 수정: 작성한 교역자 본인만, 구분·날짜·참석명단·기도제목만 고친다.
-- 작성자·작성 시각은 열 권한에서 빠져 있어 바꿀 수 없다.
grant update (meeting_date, prayer_session, title, attendee_names, prayer_topics) on report.prayer_meeting_reports to authenticated;
drop policy if exists prayer_edit on report.prayer_meeting_reports;
create policy prayer_edit on report.prayer_meeting_reports for update to authenticated
 using (report.is_clergy() and author_id = auth.uid())
 with check (report.is_clergy() and author_id = auth.uid());
-- 등록할 때와 같은 요일·필수 입력 검사를 수정에도 적용한다.
drop trigger if exists prayer_session on report.prayer_meeting_reports;
create trigger prayer_session before insert or update on report.prayer_meeting_reports
 for each row execute function report.validate_prayer_session();
