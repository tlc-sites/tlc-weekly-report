"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSessionProfile } from "@/lib/auth";

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

  redirect("/pending");
}
