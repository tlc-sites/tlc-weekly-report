"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin, isSenior } from "@/lib/auth";
import { parsePositionValue } from "@/lib/positions";

export async function approveUser(formData: FormData) {
  const { supabase } = await requireAdmin();

  const userId = z.uuid().safeParse(formData.get("userId"));
  if (!userId.success) redirect("/admin/users?error=invalid");

  const assignments: { group_id: string; role: "writer" | "reviewer"; position: string | null }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("role:") || !value) continue;
    const groupId = z.uuid().safeParse(key.slice("role:".length));
    const role = typeof value === "string" ? parsePositionValue(value) : null;
    if (!groupId.success || !role) redirect("/admin/users?error=invalid");
    assignments.push({ group_id: groupId.data, ...role });
  }
  const makeAdmin = formData.get("makeAdmin") === "on";
  if (!assignments.length && !makeAdmin) redirect("/admin/users?error=no-group");

  const { error } = await supabase.rpc("approve_user", {
    p_user: userId.data,
    p_assignments: assignments,
    p_make_admin: makeAdmin,
  });
  if (error) redirect(`/admin/users?error=${/minister role required/.test(error.message) ? "minister-role" : /position/.test(error.message) ? "position" : "save"}`);
  refresh();
}

export async function setUserStatus(formData: FormData) {
  const { supabase } = await requireAdmin();

  const parsed = z
    .object({ userId: z.uuid(), status: z.enum(["active", "disabled"]) })
    .safeParse({ userId: formData.get("userId"), status: formData.get("status") });
  if (!parsed.success) redirect("/admin/users?error=invalid");

  const { error } = await supabase.rpc("set_user_status", {
    p_user: parsed.data.userId,
    p_status: parsed.data.status,
  });
  if (error) redirect("/admin/users?error=save");
  refresh();
}

export async function saveMemberships(formData: FormData) {
  const { supabase, profile } = await requireAdmin();
  const userId = z.uuid().safeParse(formData.get("userId"));
  if (!userId.success) redirect("/admin/users?error=invalid");
  const path = `/admin/users/${userId.data}`;
  if (userId.data === profile.id && !isSenior(profile)) redirect(`${path}?error=own-memberships`);

  const assignments: { group_id: string; role: "writer" | "reviewer"; position: string | null }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("role:") || !value) continue;
    const groupId = z.uuid().safeParse(key.slice("role:".length));
    const role = typeof value === "string" ? parsePositionValue(value) : null;
    if (!groupId.success || !role) redirect(`${path}?error=invalid`);
    assignments.push({ group_id: groupId.data, ...role });
  }

  const { error } = await supabase.rpc("set_memberships", { p_user: userId.data, p_assignments: assignments });
  if (error) redirect(`${path}?error=${/own content assignments/.test(error.message) ? "own-memberships" : /minister role required/.test(error.message) ? "minister-role" : /position/.test(error.message) ? "position" : error.code === "42501" ? "assignment-permission" : "save"}`);
  redirect(`${path}?saved=1`);
}

export async function setUserAdmin(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = z
    .object({ userId: z.uuid(), isAdmin: z.enum(["true", "false"]) })
    .safeParse({ userId: formData.get("userId"), isAdmin: formData.get("isAdmin") });
  if (!parsed.success) redirect("/admin/users?error=invalid");
  const path = `/admin/users/${parsed.data.userId}`;

  const { error } = await supabase.rpc("set_user_admin", {
    p_user: parsed.data.userId,
    p_is_admin: parsed.data.isAdmin === "true",
  });
  if (error) redirect(`${path}?error=${/own admin/.test(error.message) ? "own-admin" : "save"}`);
  redirect(`${path}?saved=1`);
}

export async function setMinister(formData: FormData) {
  const { supabase, profile } = await requireAdmin();
  if (!isSenior(profile)) redirect("/admin/users?error=save");
  const parsed = z.object({ userId: z.uuid(), enabled: z.enum(["true","false"]) }).safeParse({userId:formData.get("userId"),enabled:formData.get("enabled")});
  if (!parsed.success) redirect("/admin/users?error=invalid");
  const {error} = await supabase.rpc("set_minister",{p_user:parsed.data.userId,p_enabled:parsed.data.enabled === "true"});
  redirect(`/admin/users/${parsed.data.userId}?${error ? "error=save" : "saved=1"}`);
}

export async function setRecipientRole(formData: FormData) {
  const { supabase, profile } = await requireAdmin();
  if (!isSenior(profile)) redirect("/admin/users?error=save");
  const parsed=z.object({userId:z.uuid(),role:z.enum(["","pastor","pastor_wife"])}).safeParse({userId:formData.get("userId"),role:formData.get("role")});
  if(!parsed.success) redirect("/admin/users?error=invalid");
  const {error}=await supabase.rpc("set_recipient_role",{p_user:parsed.data.userId,p_role:parsed.data.role || null});
  redirect(`/admin/users/${parsed.data.userId}?${error ? "error=save" : "saved=1"}`);
}
