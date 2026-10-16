"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActive } from "@/lib/auth";

// 회의 자료에서 이슈 상태를 바로 바꾼다 (검토자만 가능: DB의 can_edit_report 조건)
export async function updateIssueStatus(formData: FormData) {
  const { supabase, profile } = await requireActive();
  const parsed = z
    .object({ issueId: z.uuid(), status: z.enum(["open", "temporary", "resolved"]), week: z.iso.date() })
    .safeParse({ issueId: formData.get("issueId"), status: formData.get("status"), week: formData.get("week") });
  if (!parsed.success) redirect("/meeting");

  const { data, error } = await supabase
    .from("report_issues")
    .update({
      status: parsed.data.status,
      updated_by: profile.id,
      resolved_at: parsed.data.status === "resolved" ? new Date().toISOString() : null,
    })
    .eq("id", parsed.data.issueId)
    .select("id");
  if (error || !data?.length) redirect(`/meeting?week=${parsed.data.week}&error=issue`);
  refresh();
}
