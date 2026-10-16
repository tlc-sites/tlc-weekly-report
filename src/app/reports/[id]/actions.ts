"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActive } from "@/lib/auth";
import { campusPayload, educationPayload, missingOnSubmit, otherPayload, worshipPayload } from "@/lib/report-forms";
import { weekOf } from "@/lib/week";

const SCHEMAS = { education: educationPayload, worship: worshipPayload, other: otherPayload, campus: campusPayload } as const;

export async function saveReport(formData: FormData) {
  const { supabase } = await requireActive();
  const reportId = z.uuid().safeParse(formData.get("reportId"));
  if (!reportId.success) redirect("/");
  const back = `/reports/${reportId.data}`;
  const intent = formData.get("intent") === "submit" ? "submit" : "draft";

  const { data: report } = await supabase
    .from("reports")
    .select("id, group:groups(type)")
    .eq("id", reportId.data)
    .maybeSingle<{ id: string; group: { type: keyof typeof SCHEMAS } | null }>();
  const type = report?.group?.type;
  if (!report || !type) redirect("/");

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    redirect(`${back}?error=invalid`);
  }
  const parsed = SCHEMAS[type].safeParse(raw);
  if (!parsed.success) {
    const consent = parsed.error.issues.some((i) => i.message === "consent");
    redirect(`${back}?error=${consent ? "consent" : "invalid"}`);
  }
  if (intent === "submit" && missingOnSubmit(type, parsed.data).length) redirect(`${back}?error=missing`);

  const { error } = await supabase.rpc("save_report", {
    p_report: reportId.data,
    p_payload: parsed.data,
    p_status: intent === "submit" ? "submitted" : "draft",
  });
  if (error) {
    redirect(`${back}?error=${/consent/.test(error.message) ? "consent" : /forbidden|not found/.test(error.message) ? "forbidden" : "save"}`);
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
