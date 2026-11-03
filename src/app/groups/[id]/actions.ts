"use server";
import {lf} from "@/lib/form-text";

import { serviceOccursOn } from "@/lib/service-schedule";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActive } from "@/lib/auth";
import { getGroup } from "@/lib/groups";
import { sessionKinds } from "@/lib/team-session";
import { weekOf, todayKST, latestWeekday } from "@/lib/week";

// 같은 예배에 여러 담당자가 각자 보고를 남길 수 있다.
export async function createReport(formData: FormData) {
  const { supabase, profile } = await requireActive();
  const parsed = z
    .object({
      reportKind:z.enum(["standard","meeting","curriculum","assembly"]),
      authorName: z.string().trim().min(1).max(100),
      dutyPart: z.string().trim().max(100),
      groupId: z.uuid(),
      meeting: z.string().regex(/^(service|meeting):[0-9a-f-]{36}$|^custom$|^campus$/),
      customLabel: z.string().trim().max(50),
      meetingDate: z.iso.date(),
      reportWeek: z.iso.date(),
    })
    .safeParse({
      reportKind:formData.get("reportKind") ?? "standard",
      authorName: formData.get("authorName"),
      dutyPart: formData.get("dutyPart") ?? "",
      groupId: formData.get("groupId"),
      meeting: formData.get("meeting"),
      customLabel: formData.get("customLabel") ?? "",
      meetingDate: formData.get("meetingDate"),
      reportWeek: formData.get("reportWeek"),
    });
  if (!parsed.success) redirect(`/groups/${formData.get("groupId")}?error=invalid`);
  const { groupId, meeting, customLabel } = parsed.data;
  const group = await getGroup(supabase, groupId);
  if (!group || !group.is_active) redirect("/");
  if (!sessionKinds(group.type).includes(parsed.data.reportKind)) redirect(`/groups/${groupId}?week=${parsed.data.reportWeek}&error=invalid`);
  // 부산의 실제 출발일은 보고 주차와 다를 수 있으므로 별도 보관한다.
  const campusDeparture=group.type==="campus" && meeting==="campus" && parsed.data.reportKind==="standard";
  const meetingDate=campusDeparture?parsed.data.reportWeek:parsed.data.meetingDate;
  const back = `/groups/${groupId}?week=${weekOf(meetingDate)}`;
  if (weekOf(meetingDate) !== parsed.data.reportWeek || meetingDate > todayKST() || weekOf(meetingDate) > latestWeekday(todayKST(), 0)) redirect(`/groups/${groupId}?week=${parsed.data.reportWeek}&error=invalid`);

  const [kind, id] = meeting.split(":");
  if (kind === "service") {
    const { data: service } = await supabase.from("service_types").select("weekday, month_week, is_active").eq("id", id).maybeSingle();
    const { data: linked } = await supabase.from("group_service_types").select("group_id").eq("group_id", groupId).eq("service_type_id", id).maybeSingle();
    const selectedWeek = formData.get("reportWeek");
    if (!service?.is_active || !linked || !serviceOccursOn(meetingDate, service) ||
      (typeof selectedWeek === "string" && weekOf(meetingDate) !== selectedWeek)) redirect(back + "&error=invalid");
  }
  if (kind === "meeting") {
    const { data: groupMeeting } = await supabase.from("group_meeting_types").select("weekday,is_active").eq("id",id).eq("group_id",groupId).maybeSingle();
    if (!groupMeeting?.is_active || !serviceOccursOn(meetingDate, groupMeeting)) redirect(back + "&error=invalid");
  }
  const fields = {
    service_type_id: kind === "service" ? id : null,
    group_meeting_type_id: kind === "meeting" ? id : null,
    meeting_label: kind === "custom" ? customLabel : kind === "campus" ? "부산 방문" : null,
  };
  if (kind === "custom" && !customLabel) redirect(`${back}&error=label`);
  // 전체모임 출결표는 팀 명단(쉬는 사람 제외)으로 미리 채운다. 기본값은 출석이고 결석자만 바꾸면 된다.
  let roster: { name: string; present: boolean; note: string; follow_up: string }[] | undefined;
  if (parsed.data.reportKind === "assembly") {
    const { data: members } = await supabase.from("members").select("name").eq("group_id", groupId).neq("status", "inactive").order("name");
    roster = (members ?? []).slice(0, 150).map((m) => ({ name: m.name as string, present: true, note: "", follow_up: "" }));
  }

  const { data, error } = await supabase
    .from("reports")
    .insert({ group_id: groupId, author_id: profile.id, author_name:parsed.data.authorName,duty_part:parsed.data.dutyPart, details:{...(campusDeparture?{depart_pangyo:parsed.data.meetingDate}:{}),session_type:parsed.data.reportKind,...(roster?{members:roster}:{}),_report_meta:{author_name:parsed.data.authorName,duty_part:parsed.data.dutyPart}}, meeting_date: meetingDate, status: "draft", ...fields })
    .select("id")
    .single();
  if (error || !data) redirect(`${back}&error=save`);
  redirect(`/reports/${data.id}`);
}

// 그 주 모임 없음 표시 / 해제
// 사유는 여러 줄로 적을 수 있다. 브라우저는 줄바꿈을 \r\n으로 보내므로 \n으로 바꾼 뒤 글자 수를 센다.
export async function setNoMeeting(_previous: { error: string; saved: boolean; reason?: string }, formData: FormData) {
  const { supabase, profile } = await requireActive();
  const typed = String(lf(formData.get("reason") ?? ""));
  const parsed = z
    .object({
      groupId: z.uuid(),
      week: z.iso.date(),
      on: z.enum(["true", "false"]),
      reason: z.string().trim().max(1000),
    })
    .safeParse({
      groupId: formData.get("groupId"),
      week: formData.get("week"),
      on: formData.get("on"),
      reason: typed,
    });
  if (!parsed.success || weekOf(parsed.data.week) !== parsed.data.week) return { error: "사유는 1000자까지 적을 수 있습니다. 입력 내용을 확인해 주세요.", saved: false, reason: typed };
  const { groupId, week, on, reason } = parsed.data;
  const group = await getGroup(supabase, groupId);
  if (!group || !group.is_active || week > latestWeekday(todayKST(), 0)) return { error: "이 주차에는 모임 없음을 등록할 수 없습니다.", saved: false, reason: typed };
  if (on === "true" && !reason) return { error: "모임이 없는 사유를 적어 주세요.", saved: false, reason: typed };

  const { error } =
    on === "true"
      ? await supabase
          .from("week_status")
          .upsert({ group_id: groupId, week, no_meeting: true, reason: reason || null, set_by: profile.id, updated_at: new Date().toISOString() })
      : await supabase.from("week_status").delete().eq("group_id", groupId).eq("week", week);
  if (error) return { error: "저장하지 못했습니다. 권한과 입력 내용을 확인해 주세요.", saved: false, reason: typed };
  refresh();
  return { error: "", saved: true };
}
