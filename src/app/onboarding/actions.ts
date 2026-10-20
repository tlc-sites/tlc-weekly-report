"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSessionProfile } from "@/lib/auth";
import { notifyRegistrationAlerts } from "@/lib/registration-alerts";

const schema = z.object({
  realName: z.string().trim().min(1).max(30),
  groupIds: z.array(z.uuid()).min(1).max(20),
});

export async function submitOnboarding(formData: FormData) {
  const { supabase, profile } = await getSessionProfile();
  if (!profile) redirect("/login");
  if (profile.status !== "pending") redirect("/");

  const parsed = schema.safeParse({
    realName: formData.get("realName"),
    groupIds: formData.getAll("groupIds"),
  });
  if (!parsed.success) redirect("/onboarding?error=invalid");

  const { error } = await supabase
    .from("profiles")
    .update({ real_name: parsed.data.realName, requested_group_ids: parsed.data.groupIds })
    .eq("id", profile.id);
  if (error) redirect("/onboarding?error=save");
  // 신청 접수는 보존하고, 푸시 오류 때문에 중복 신청을 요구하지 않는다.
  try { await notifyRegistrationAlerts(profile.id); } catch { /* 정기 작업에서 재시도한다. */ }
  redirect("/pending");
}
