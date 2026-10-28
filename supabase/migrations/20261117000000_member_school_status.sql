-- 학생 명단: 생년월일과 겹치는 출생연도 대신 학교를 적는다. 기존 birth_year 값은 보존한다.
alter table report.members add column if not exists school text check(char_length(school)<=50);

-- 명단 상태: 장기 결석자·장기 방문자. 출결 명단에는 보이지만 재적 수(enrolled_snapshot)에는 넣지 않는다.
-- 새 값은 같은 트랜잭션에서 쓸 수 없으므로 이 파일에서는 추가만 한다.
alter type report.person_status add value if not exists 'long_absent';
alter type report.person_status add value if not exists 'long_visitor';
