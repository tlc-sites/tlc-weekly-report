"use server";

import {isTeamSession,teamSessionPayload} from "@/lib/team-session";
import { preserveReportIdentity } from "@/lib/report-identity";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActive, isClergy } from "@/lib/auth";
import { campusPayload, educationPayload, missingOnSubmit, otherPayload, worshipPayload } from "@/lib/report-forms";
import { weekOf } from "@/lib/week";

const SCHEMAS = { education: educationPayload, worship: worshipPayload, other: otherPayload, campus: campusPayload } as const;

export async function saveReport(formData: FormData) {
  const { supabase, profile } = await requireActive();
  const reportId = z.uuid().safeParse(formData.get("reportId"));
  if (!reportId.success) redirect("/");
  const back = `/reports/${reportId.data}`;
  const intent = formData.get("intent") === "submit" ? "submit" : "draft";

  const { data: report } = await supabase
    .from("reports")
    .select("id, details, author:profiles!reports_author_id_fkey(real_name), group:groups(type)")
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

  const { error } = await supabase.rpc("save_report", {
    p_report: reportId.data,
    p_payload: {...parsed.data,details:{...parsed.data.details,_report_meta:preserveReportIdentity(report.details,report.author?.real_name,{id:profile.id,name:profile.real_name})}},
    p_status: intent === "submit" ? "submitted" : "draft",
  });
  if (error) {
    redirect(`${back}?error=${/education attendance assignment/.test(error.message) ? "attendance-assignment" : /consent/.test(error.message) ? "consent" : /forbidden|not found/.test(error.message) ? "forbidden" : "save"}`);
  }
  redirect(`${back}?saved=${intent}`);
}

// 임시저장 상태인 내 보고만 지울 수 있다 (DB 정책과 같은 조건)
export async function deleteDraft(formData: FormData) {
  const { supabase } = await requireActive();
  const reportId = z.uuid().safeParse(formData.get("reportId"));
  if (!reportId.success) redirect("/");

  const { data } = await supabase.from("reports").select("group_id, meeting_date").eq("id", reportId.data).maybeSingle();
  const { data: deleted, error } = await supabase.from("reports").delete().eq("id", reportId.data).eq("status", "draft").select("id");
  if (error || !deleted?.length || !data) redirect(`/reports/${reportId.data}?error=delete`);
  redirect(`/groups/${data.group_id}?week=${weekOf(data.meeting_date)}`);
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
    .select("id");
  if (error || !data?.length) redirect(`${back}?error=forbidden`);
  redirect(`${back}?reviewed=${parsed.data.reviewed}`);
}

export async function addComment(formData: FormData) {
  const { supabase, profile } = await requireActive();
  if (!isClergy(profile)) redirect("/");
  const parsed = z
    .object({ reportId: z.uuid(), body: z.string().trim().min(1).max(1000) })
    .safeParse({ reportId: formData.get("reportId"), body: formData.get("body") });
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
