-- DB49 교역자가 아닌 분은 본인이 쓴 보고만 본다(사용자 결정 2026-11-07).
-- 지금까지는 같은 직급(층) 작성자의 보고·이슈 일반 내용을 서로 볼 수 있었다(same_content_layer). 이것을 교역자·담임에게만 남긴다.
-- 그대로 두는 것: 팀 검토 역할(리더·팀장·총괄 reviewer)의 맡은 팀 보고, 교역자 태그·작성자의 '함께 보는 부서'·개별 공유로 받은 보고.
-- 교역자·담임의 결과는 바뀌지 않는다(같은 층 판단은 그대로).
create or replace function report.same_content_layer(layer integer) returns boolean
language sql stable security definer set search_path='' as $$
  select report.is_active_user() and layer>0 and report.is_clergy() and (
    (layer=4 and report.is_senior()) or (layer=3 and report.is_clergy()) or
    exists(select 1 from report.memberships m where m.user_id=auth.uid() and report.group_content_layer(auth.uid(),m.group_id)=layer));
$$;
