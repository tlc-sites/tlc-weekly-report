-- 4차: 보고 저장 RPC
-- 출석·새친구·기도제목·이슈·담임목사님/사모님께 드리는 글을 한 트랜잭션으로 저장한다.
-- security definer가 아니므로 호출한 사람의 권한(RLS)이 그대로 적용된다.

create function report.save_report(p_report uuid, p_payload jsonb, p_status report.report_status)
returns void
language plpgsql set search_path = '' as $$
declare
  v_group uuid;
  v_type report.group_type;
  v_date date;
  v_author uuid;
  v_member uuid;
  v_recipient report.message_recipient;
  v_body text;
  item jsonb;
begin
  if p_status not in ('draft', 'submitted') then
    raise exception 'invalid status';
  end if;

  select r.group_id, g.type, r.meeting_date, r.author_id
    into v_group, v_type, v_date, v_author
    from report.reports r join report.groups g on g.id = r.group_id
   where r.id = p_report;
  if v_group is null then
    raise exception 'report not found' using errcode = '42501';
  end if;

  update report.reports
     set details = coalesce(p_payload -> 'details', '{}'::jsonb), status = p_status
   where id = p_report;
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- ───── 교육부서: 새친구 등록과 출석 ─────
  if v_type = 'education' then
    for item in select * from jsonb_array_elements(coalesce(p_payload -> 'newcomers', '[]'::jsonb)) loop
      if coalesce(btrim(item ->> 'guardian_contact'), '') <> '' and not coalesce((item ->> 'consent')::boolean, false) then
        raise exception 'guardian consent required';
      end if;

      insert into report.members (group_id, name, kind, grade, status, first_visit_date, follow_up_status)
      values (v_group, btrim(item ->> 'name'), 'student', nullif(btrim(item ->> 'grade'), ''), 'newcomer', v_date, 'new')
      returning id into v_member;

      if coalesce(btrim(item ->> 'guardian_name'), '') <> '' or coalesce(btrim(item ->> 'guardian_contact'), '') <> '' then
        insert into report.member_guardians (member_id, slot, name, relation, contact, consent)
        values (v_member, 1, nullif(btrim(item ->> 'guardian_name'), ''), nullif(item ->> 'guardian_relation', ''),
                nullif(btrim(item ->> 'guardian_contact'), ''), coalesce((item ->> 'consent')::boolean, false));
      end if;

      insert into report.attendance (report_id, member_id, present) values (p_report, v_member, true);
    end loop;

    for item in select * from jsonb_array_elements(coalesce(p_payload -> 'attendance', '[]'::jsonb)) loop
      if not exists (
        select 1 from report.members m where m.id = (item ->> 'member_id')::uuid and m.group_id = v_group
      ) then
        raise exception 'member not in group';
      end if;
      insert into report.attendance (report_id, member_id, present, absence_reason, contacted, guardian_present)
      values (p_report, (item ->> 'member_id')::uuid, coalesce((item ->> 'present')::boolean, false),
              nullif(btrim(item ->> 'absence_reason'), ''), coalesce((item ->> 'contacted')::boolean, false),
              coalesce((item ->> 'guardian_present')::boolean, false))
      on conflict (report_id, member_id) do update
        set present = excluded.present, absence_reason = excluded.absence_reason,
            contacted = excluded.contacted, guardian_present = excluded.guardian_present;
    end loop;

    -- 그 시점의 재적·출석 학생 수를 남긴다 (명단이 바뀌어도 당시 통계가 유지되도록)
    update report.reports r
       set enrolled_snapshot = (select count(*) from report.members m
                                 where m.group_id = v_group and m.kind = 'student' and m.status in ('active', 'newcomer')),
           attend_snapshot = (select count(*) from report.attendance a join report.members m on m.id = a.member_id
                               where a.report_id = p_report and a.present and m.kind = 'student')
     where r.id = p_report;
  end if;

  -- ───── 기도제목 ─────
  if p_payload ? 'prayer' then
    if coalesce(btrim(p_payload ->> 'prayer'), '') = '' then
      delete from report.report_prayers where report_id = p_report;
    else
      insert into report.report_prayers (report_id, body) values (p_report, btrim(p_payload ->> 'prayer'))
      on conflict (report_id) do update set body = excluded.body;
    end if;
  end if;

  -- ───── 이슈 (예배팀·기타 모임): 확인 전에는 통째로 교체 ─────
  if p_payload ? 'issues' then
    delete from report.report_issues where report_id = p_report;
    insert into report.report_issues (report_id, category, content, status, action, updated_by, resolved_at)
    select p_report, btrim(i ->> 'category'), btrim(i ->> 'content'), (i ->> 'status')::report.issue_status,
           nullif(btrim(i ->> 'action'), ''), auth.uid(),
           case when i ->> 'status' = 'resolved' then now() end
      from jsonb_array_elements(p_payload -> 'issues') i;
  end if;

  -- ───── 담임목사님·사모님께 드리는 글: 작성자 본인만 ─────
  if p_payload ? 'messages' and v_author = auth.uid() then
    foreach v_recipient in array array['pastor', 'pastor_wife']::report.message_recipient[] loop
      v_body := btrim(coalesce(p_payload -> 'messages' ->> v_recipient::text, ''));
      if v_body = '' then
        delete from report.report_messages where report_id = p_report and recipient = v_recipient;
      else
        insert into report.report_messages (report_id, recipient, body) values (p_report, v_recipient, v_body)
        on conflict (report_id, recipient) do update set body = excluded.body, updated_at = now();
      end if;
    end loop;
  end if;
end;
$$;

revoke execute on function report.save_report(uuid, jsonb, report.report_status) from public, anon;
grant execute on function report.save_report(uuid, jsonb, report.report_status) to authenticated;
