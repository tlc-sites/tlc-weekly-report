-- 모든 파트에서 주간 사역 없음 사유 등록. 기존 작성권한 RLS는 유지한다.
create or replace function report.validate_no_meeting() returns trigger language plpgsql set search_path='' as $$
begin
 if new.no_meeting then
  if not exists(select 1 from report.groups where id=new.group_id and is_active) then raise exception 'active group required';end if;
  if nullif(btrim(new.reason),'') is null then raise exception 'reason required';end if;
  if new.week>((now() at time zone 'Asia/Seoul')::date-extract(dow from now() at time zone 'Asia/Seoul')::int) then raise exception 'future week';end if;
 end if;return new;
end $$;
create function report.validate_campus_finances() returns trigger language plpgsql set search_path='' as $$
declare item text;
begin
 if new.status<>'submitted' or not exists(select 1 from report.groups where id=new.group_id and type='campus') then return new;end if;
 if TG_OP='UPDATE' then if old.status<>'draft' and (new.details-'_report_meta') is not distinct from (old.details-'_report_meta') then return new;end if;end if;
 if coalesce(jsonb_array_length(new.details->'offerings'),0)=0 and nullif(btrim(new.details->>'offerings_other'),'') is null then raise exception 'campus offerings required';end if;
 foreach item in array array['train','bus','taxi','parking','meals'] loop
  if jsonb_typeof(new.details->'counts'->item) is distinct from 'number' or (new.details->'counts'->>item)::numeric<0 or (new.details->'counts'->>item)::numeric>99 or trunc((new.details->'counts'->>item)::numeric)<>(new.details->'counts'->>item)::numeric then raise exception 'campus expense required: %',item;end if;
 end loop;
 if nullif(btrim(new.details->>'lodging'),'') is null then raise exception 'campus lodging required';end if;
 return new;
end $$;
revoke all on function report.validate_campus_finances() from public,anon,authenticated;
create trigger campus_finance_validation before insert or update on report.reports for each row execute function report.validate_campus_finances();
-- 수정 가능한 컬럼과 부모 열람 범위를 함께 제한한다.
do $$ declare t text; parent_check text;begin
 foreach t in array array['report_comments','incident_comments','prayer_meeting_comments','notice_comments','report_comment_replies','incident_comment_replies','prayer_comment_replies','notice_comment_replies'] loop
  parent_check=case t
   when 'report_comments' then 'report.is_clergy() and report.can_view_report(report_id)'
   when 'incident_comments' then 'report.is_clergy() and exists(select 1 from report.worship_incidents i where i.id=incident_id)'
   when 'prayer_meeting_comments' then 'report.is_clergy()'
   when 'notice_comments' then 'report.can_read_notice(notice_id)'
   when 'report_comment_replies' then 'exists(select 1 from report.report_comments c where c.id=comment_id and report.can_view_report(c.report_id))'
   when 'incident_comment_replies' then 'exists(select 1 from report.incident_comments c where c.id=comment_id)'
   when 'prayer_comment_replies' then 'report.is_clergy()'
   else 'exists(select 1 from report.notice_comments c where c.id=comment_id and report.can_read_notice(c.notice_id))' end;
  execute format('revoke update on report.%I from authenticated',t);
  execute format('grant update(body) on report.%I to authenticated',t);
  execute format('create policy comment_edit_own on report.%I for update to authenticated using(report.is_active_user() and author_id=auth.uid() and (%s)) with check(report.is_active_user() and author_id=auth.uid() and (%s))',t,parent_check,parent_check);
 end loop;
end $$;
