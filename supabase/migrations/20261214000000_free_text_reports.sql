-- DB54 보고서 본문(여러 줄 칸)의 글자수 제한을 없앤다.
-- 한 줄 칸(이름·제목·연락처 등)과 코멘트·공지 길이 제한은 그대로 둔다.
-- 꼭 써야 하는 칸은 비어 있지 않은지만 계속 검사한다.

-- 보고서: 기도제목, 이슈 내용·조치, 담임 목사님·사모님께 드리는 말씀
alter table report.report_prayers drop constraint if exists report_prayers_body_check;
alter table report.report_issues drop constraint if exists report_issues_content_check;
alter table report.report_issues add constraint report_issues_content_check check (char_length(content) >= 1);
alter table report.report_issues drop constraint if exists report_issues_action_check;
alter table report.report_messages drop constraint if exists report_messages_body_check;
alter table report.report_messages add constraint report_messages_body_check check (char_length(body) >= 1);

-- 주중 기도회 보고와 그 작성 중 사본
alter table report.prayer_meeting_reports drop constraint if exists prayer_meeting_reports_content_check;
alter table report.prayer_meeting_reports add constraint prayer_meeting_reports_content_check check (char_length(btrim(content)) >= 1);
alter table report.prayer_meeting_reports drop constraint if exists prayer_meeting_reports_prayer_topics_check;
alter table report.prayer_meeting_reports drop constraint if exists prayer_meeting_reports_attendee_names_check;
alter table report.prayer_meeting_reports drop constraint if exists prayer_meeting_reports_notes_check;
alter table report.prayer_meeting_drafts drop constraint if exists prayer_meeting_drafts_prayer_topics_check;
alter table report.prayer_meeting_drafts drop constraint if exists prayer_meeting_drafts_attendee_names_check;

-- 예배 이슈 보고
alter table report.worship_incidents drop constraint if exists worship_incidents_circumstances_check;
alter table report.worship_incidents add constraint worship_incidents_circumstances_check check (char_length(btrim(circumstances)) >= 1);
alter table report.worship_incidents drop constraint if exists worship_incidents_cause_check;
alter table report.worship_incidents drop constraint if exists worship_incidents_response_check;
alter table report.worship_incidents drop constraint if exists worship_incidents_prevention_check;

-- 예배위원 명단
alter table report.worship_staff drop constraint if exists worship_staff_staff_check;

-- 작성 중 자동저장: 256KB → 1MB (화면이 보내는 요청 한도와 맞춘다)
alter table report.report_drafts drop constraint if exists report_drafts_payload_check;
alter table report.report_drafts add constraint report_drafts_payload_check check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 1048576);
create or replace function report.autosave_report(p_report uuid,p_expected_updated_at timestamptz,p_payload jsonb) returns timestamptz
language plpgsql security definer set search_path='' as $$
declare existing report.reports; saved_at timestamptz; current_version timestamptz; base_version timestamptz;
begin
 if not report.is_active_user() then raise exception 'forbidden' using errcode='42501';end if;
 select * into existing from report.reports where id=p_report for update;
 if not found or existing.author_id<>auth.uid() or not report.can_edit_report(p_report) then raise exception 'forbidden' using errcode='42501';end if;
 if existing.status<>'draft' then raise exception 'autosave requires draft';end if;
 select updated_at,report_updated_at into current_version,base_version from report.report_drafts where report_id=p_report;
 if base_version is not null and base_version<>existing.updated_at then raise exception 'autosave conflict';end if;
 current_version=coalesce(current_version,existing.updated_at);
 if p_expected_updated_at is null or current_version<>p_expected_updated_at then raise exception 'autosave conflict';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>1048576 then raise exception 'invalid draft payload';end if;
 if jsonb_typeof(p_payload->'newcomers')='array' and exists(select 1 from jsonb_array_elements(p_payload->'newcomers') n where coalesce(btrim(n->>'guardian_contact'),'')<>'' and coalesce(n->>'consent','false')<>'true') then raise exception 'guardian consent required';end if;
 insert into report.report_drafts(report_id,author_id,payload,report_updated_at) values(p_report,auth.uid(),p_payload,existing.updated_at)
 on conflict(report_id) do update set payload=excluded.payload,updated_at=clock_timestamp()
 returning updated_at into saved_at;
 return saved_at;
end $$;
