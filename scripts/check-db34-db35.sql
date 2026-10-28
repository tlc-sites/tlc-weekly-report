-- DB34(명단 학교·장기 상태)·DB35(성찬 파트) 적용 전 운영 상태 확인. 읽기만 한다.
select 'school_column' as item, exists(select 1 from information_schema.columns where table_schema='report' and table_name='members' and column_name='school')::text as value
union all
select 'person_status', (select string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_enum e join pg_type t on t.oid=e.enumtypid join pg_namespace n on n.oid=t.typnamespace where n.nspname='report' and t.typname='person_status')
union all
select 'education_groups', (select string_agg(g.name||case when g.is_active then '' else '(비활성)' end, ', ' order by g.sort_order) from report.groups g join report.groups p on p.id=g.parent_id where p.name='교육부' and p.parent_id is null)
union all
select 'communion_groups', (select string_agg(g.name||case when g.is_active then '' else '(비활성)' end||' 보고'||(select count(*) from report.reports r where r.group_id=g.id)||'건', ', ' order by g.sort_order) from report.groups g join report.groups p on p.id=g.parent_id where p.name='예배/기술팀' and p.parent_id is null and g.name like '%성찬%');
