"use server";

import { serviceOccursOn } from "@/lib/service-schedule";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActive } from "@/lib/auth";
import { getGroup } from "@/lib/groups";
import { weekOf } from "@/lib/week";

// 새 보고 만들기. 같은 그룹·날짜·모임의 보고가 이미 있으면 새로 만들지 않고 그 보고를 연다.
export async function createReport(formData: FormData) {
  const { supabase, profile } = await requireActive();
  const parsed = z
    .object({
      groupId: z.uuid(),
      meeting: z.string().regex(/^(service|meeting):[0-9a-f-]{36}$|^custom$|^campus$/),
      customLabel: z.string().trim().max(50),
      meetingDate: z.iso.date(),
    })
    .safeParse({
      groupId: formData.get("groupId"),
      meeting: formData.get("meeting"),
      customLabel: formData.get("customLabel") ?? "",
      meetingDate: formData.get("meetingDate"),
    });
  if (!parsed.success) redirect(`/groups/${formData.get("groupId")}?error=invalid`);
  const { groupId, meeting, customLabel, meetingDate } = parsed.data;
  const back = `/groups/${groupId}?week=${weekOf(meetingDate)}`;

  const group = await getGroup(supabase, groupId);
  if (!group || !group.is_active) redirect("/");

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

  let existing = supabase.from("reports").select("id").eq("group_id", groupId).eq("meeting_date", meetingDate);
  existing = fields.service_type_id
    ? existing.eq("service_type_id", fields.service_type_id)
    : fields.group_meeting_type_id
      ? existing.eq("group_meeting_type_id", fields.group_meeting_type_id)
      : existing.eq("meeting_label", fields.meeting_label!);
  const { data: found } = await existing.limit(1).maybeSingle();
  if (found) redirect(`/reports/${found.id}?existing=1`);

  const { data, error } = await supabase
    .from("reports")
    .insert({ group_id: groupId, author_id: profile.id, meeting_date: meetingDate, status: "draft", ...fields })
    .select("id")
    .single();
  if (error || !data) redirect(`${back}&error=save`);
  redirect(`/reports/${data.id}`);
}

// 그 주 모임 없음 표시 / 해제
export async function setNoMeeting(formData: FormData) {
  const { supabase, profile } = await requireActive();
  const parsed = z
    .object({
      groupId: z.uuid(),
      week: z.iso.date(),
      on: z.enum(["true", "false"]),
      reason: z.string().trim().max(100),
    })
    .safeParse({
      groupId: formData.get("groupId"),
      week: formData.get("week"),
      on: formData.get("on"),
      reason: formData.get("reason") ?? "",
    });
  if (!parsed.success || weekOf(parsed.data.week) !== parsed.data.week) redirect("/");
  const { groupId, week, on, reason } = parsed.data;

  const { error } =
    on === "true"
      ? await supabase
          .from("week_status")
          .upsert({ group_id: groupId, week, no_meeting: true, reason: reason || null, set_by: profile.id, updated_at: new Date().toISOString() })
      : await supabase.from("week_status").delete().eq("group_id", groupId).eq("week", week);
  if (error) redirect(`/groups/${groupId}?week=${week}&error=save`);
  refresh();
}
