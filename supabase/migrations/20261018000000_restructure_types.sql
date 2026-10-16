-- 3차 (1/2): 타입 변경. enum에 추가한 값은 같은 트랜잭션에서 쓸 수 없어서 따로 실행한다.

-- ───────────── 예배 목록: 구분 칸 삭제 ─────────────
alter table report.service_types drop column category;

-- ───────────── 그룹 유형: 기술팀 → 예배팀, 부산 캠퍼스 추가 ─────────────
alter type report.group_type rename value 'tech' to 'worship';
alter type report.group_type add value 'campus';
