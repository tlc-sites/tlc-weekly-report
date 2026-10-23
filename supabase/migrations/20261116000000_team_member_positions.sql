-- 팀원 구분을 학생·교사 구분과 분리하며 기존 명단 RLS를 유지한다.
alter table report.members add column team_position text check(char_length(team_position)<=100);
grant select,insert(team_position),update(team_position) on report.members to authenticated;
