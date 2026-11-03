-- 교회학교 명단에 성별을 기록한다. 기존 인원은 비워 두고(미입력) 검토자가 상세 화면에서 채운다.
alter table report.members add column if not exists gender text check (gender in ('male','female'));

-- 주중 기도회 임시저장: 교역자마다 작성 중인 새 보고 하나를 본인만 보고 고친다.
-- 등록하면 지운다. 임시저장은 다른 교역자 목록·주간 메일에 나오지 않는다.
create table if not exists report.prayer_meeting_drafts(
 author_id uuid primary key references report.profiles(id) on delete cascade,
 meeting_date date,
 prayer_session text check (prayer_session in ('morning','evening')),
 attendee_names text not null default '' check (char_length(attendee_names)<=3000),
 prayer_topics text not null default '' check (char_length(prayer_topics)<=5000),
 updated_at timestamptz not null default now()
);
alter table report.prayer_meeting_drafts enable row level security;
grant select,insert,update,delete on report.prayer_meeting_drafts to authenticated;
drop policy if exists prayer_draft_own on report.prayer_meeting_drafts;
create policy prayer_draft_own on report.prayer_meeting_drafts for all to authenticated
 using (report.is_clergy() and author_id=auth.uid())
 with check (report.is_clergy() and author_id=auth.uid());
