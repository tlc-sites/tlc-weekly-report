"use server";
import {lf} from "@/lib/form-text";

import {isTeamSession,teamSessionPayload} from "@/lib/team-session";
import { preserveReportIdentity } from "@/lib/report-identity";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { notifyReportSubmission } from "@/lib/report-submission-push";
import { z } from "zod";
import { requireActive, isClergy } from "@/lib/auth";
import { campusPayload, educationPayload, missingOnSubmit, otherPayload, worshipPayload } from "@/lib/report-forms";
import { serviceOccursOn } from "@/lib/service-schedule";
import { todayKST, weekOf } from "@/lib/week";

const SCHEMAS = { education: educationPayload, worship: worshipPayload, other: otherPayload, campus: campusPayload } as const;

export async function saveReport(formData: FormData) {
  const { supabase, profile } = await requireActive();
  const reportId = z.uuid().safeParse(formData.get("reportId"));
  if (!reportId.success) redirect("/");
  const back = `/reports/${reportId.data}`;
  const intent = formData.get("intent") === "submit" ? "submit" : "draft";

  const { data: report } = await supabase
    .from("reports")
    .select("id, details, author:profiles!reports_author_id_fkey(real_name), group:groups!reports_group_id_fkey(type)")
    .eq("id", reportId.data)
    .maybeSingle<{ id: string; details:Record<string,unknown>; author:{real_name:string|null}|null; group: { type: keyof typeof SCHEMAS } | null }>();
  const type = report?.group?.type;
  if (!report || !type) redirect("/");

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    redirect(`${back}?error=invalid`);
  }
  const parsed = (isTeamSession(report.details) ? teamSessionPayload : SCHEMAS[type]).safeParse(raw);
  if (!parsed.success) {
    const consent = parsed.error.issues.some((i) => i.message === "consent");
    redirect(`${back}?error=${consent ? "consent" : "invalid"}`);
  }
  if(isTeamSession(report.details) && (parsed.data.details as Record<string,unknown>).session_type!==report.details.session_type) redirect(`${back}?error=invalid`);
  if (intent === "submit" && missingOnSubmit(type, parsed.data).length) redirect(`${back}?error=missing`);

  const notificationSince = new Date().toISOString();
  const { error } = await supabase.rpc("save_report_from_draft", {
    p_report: reportId.data,
    p_expected_draft_updated_at: String(formData.get("draftVersion")??"") || null,
    p_payload: {...parsed.data,details:{...parsed.data.details,_report_meta:preserveReportIdentity(report.details,report.author?.real_name,{id:profile.id,name:profile.real_name})}},
    p_status: intent === "submit" ? "submitted" : "draft",
  });
  if (error) {
    redirect(`${back}?error=${/autosave conflict/.test(error.message) ? "conflict" : /campus (offerings|expense|lodging) required/.test(error.message) ? "campus-finance" : /education attendance assignment/.test(error.message) ? "attendance-assignment" : /consent/.test(error.message) ? "consent" : /forbidden|not found/.test(error.message) ? "forbidden" : "save"}`);
  }
  if (intent === "submit") after(async () => {
    try { await notifyReportSubmission(reportId.data, notificationSince); }
    catch { console.error("[report-push] 제출은 완료됐지만 푸시를 전달하지 못했습니다."); }
  });
  redirect(`${back}?saved=${intent}`);
}

// 임시저장 상태인 내 보고만 지울 수 있다 (DB 정책과 같은 조건)
export async function deleteDraft(formData: FormData) {
  const { supabase } = await requireActive();
  const reportId = z.uuid().safeParse(formData.get("reportId"));
  if (!reportId.success) redirect("/");

  const { data } = await supabase.from("reports").select("group_id, meeting_date, status").eq("id", reportId.data).maybeSingle();
  // 보고서를 지우면 Storage 권한도 사라지므로 사진 파일을 먼저 지운다.
  if (data?.status === "draft") {
    const { data: images } = await supabase.from("report_images").select("path").eq("report_id", reportId.data);
    if (images?.length) await supabase.storage.from("report-images").remove(images.map((i) => i.path));
  }
  const { data: deleted, error } = await supabase.from("reports").delete().eq("id", reportId.data).eq("status", "draft").select("id");
  if (error || !deleted?.length || !data) redirect(`/reports/${reportId.data}?error=delete`);
  redirect(`/groups/${data.group_id}?week=${weekOf(data.meeting_date)}`);
}

// 모임 날짜 바꾸기: 다음 날 작성해서 오늘 날짜로 만들어진 보고를 실제 모임 날로 옮긴다.
// 수정 권한은 DB 정책(작성자는 확인 전까지, 검토자는 언제나)을 따르고, 미래 날짜는 DB 트리거도 막는다.
export async function changeMeetingDate(formData: FormData) {
  const { supabase } = await requireActive();
  const parsed = z.object({ reportId: z.uuid(), meetingDate: z.iso.date() }).safeParse({ reportId: formData.get("reportId"), meetingDate: formData.get("meetingDate") });
  if (!parsed.success) redirect("/");
  const { reportId, meetingDate } = parsed.data;
  const back = `/reports/${reportId}`;
  const { data: report } = await supabase
    .from("reports")
    .select("meeting_date, meeting_label, service_type_id, group_meeting_type_id, group:groups!reports_group_id_fkey(type)")
    .eq("id", reportId)
    .maybeSingle<{ meeting_date: string; meeting_label: string | null; service_type_id: string | null; group_meeting_type_id: string | null; group: { type: string } | null }>();
  if (!report) redirect("/");
  // 부산 방문 보고의 날짜는 보고 주차이고 실제 출발일은 본문에서 따로 고친다
  if (report.group?.type === "campus" && report.meeting_label === "부산 방문") redirect(`${back}?error=date`);
  if (meetingDate === report.meeting_date) redirect(back);
  if (meetingDate > todayKST()) redirect(`${back}?error=date`);
  // 정해진 요일의 예배·모임은 그 요일로만 옮길 수 있다
  const schedule = report.service_type_id
    ? (await supabase.from("service_types").select("weekday, month_week").eq("id", report.service_type_id).maybeSingle()).data
    : report.group_meeting_type_id
      ? (await supabase.from("group_meeting_types").select("weekday").eq("id", report.group_meeting_type_id).maybeSingle()).data
      : { weekday: null };
  if (!schedule || !serviceOccursOn(meetingDate, schedule)) redirect(`${back}?error=date-weekday`);
  const { data, error } = await supabase.from("reports").update({ meeting_date: meetingDate }).eq("id", reportId).select("id");
  if (error || !data?.length) redirect(`${back}?error=forbidden`);
  redirect(`${back}?dated=1`);
}

// 검토자의 확인 처리 / 확인 취소 (확인자와 시각은 DB 트리거가 기록)
export async function setReviewStatus(formData: FormData) {
  const { supabase } = await requireActive();
  const parsed = z
    .object({ reportId: z.uuid(), reviewed: z.enum(["true", "false"]) })
    .safeParse({ reportId: formData.get("reportId"), reviewed: formData.get("reviewed") });
  if (!parsed.success) redirect("/");
  const back = `/reports/${parsed.data.reportId}`;

  const { data, error } = await supabase
    .from("reports")
    .update({ status: parsed.data.reviewed === "true" ? "reviewed" : "submitted" })
    .eq("id", parsed.data.reportId)
    .neq("status", "draft")
    .select("id, meeting_date");
  if (error || !data?.length) redirect(`${back}?error=forbidden`);
  // 확인하면 그 주 홈(메인) 화면으로 돌아가 알림을 띄운다. 확인 취소는 보고 화면에 남는다.
  if (parsed.data.reviewed === "true") redirect(`/?week=${weekOf(data[0].meeting_date)}&reviewed=${parsed.data.reportId}`);
  redirect(`${back}?reviewed=false`);
}

export async function addComment(formData: FormData) {
  const { supabase, profile } = await requireActive();
  if (!isClergy(profile)) redirect("/");
  const parsed = z
    .object({ reportId: z.uuid(), body: z.string().trim().min(1).max(1000) })
    .safeParse({ reportId: formData.get("reportId"), body: lf(formData.get("body")) });
  if (!parsed.success) redirect(`/reports/${formData.get("reportId")}?error=comment`);

  const { error } = await supabase
    .from("report_comments")
    .insert({ report_id: parsed.data.reportId, author_id: profile.id, body: parsed.data.body });
  if (error) redirect(`/reports/${parsed.data.reportId}?error=comment`);
  // 같은 주소로 이동하면 해시만 바뀌어 화면이 갱신되지 않으므로 현재 화면을 새로 그린다
  refresh();
}

export async function deleteComment(formData: FormData) {
  const { supabase } = await requireActive();
  const parsed = z
    .object({ reportId: z.uuid(), commentId: z.uuid() })
    .safeParse({ reportId: formData.get("reportId"), commentId: formData.get("commentId") });
  if (!parsed.success) redirect("/");

  await supabase.from("report_comments").delete().eq("id", parsed.data.commentId);
  refresh();
}
