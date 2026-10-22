-- 기존 사진팀의 ID·소속·보고·명단은 유지하고 분류만 바로잡는다.
update report.groups set type='worship' where name='사진팀' and type<>'worship';
