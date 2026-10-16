"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";

const roleSchema = z.enum(["writer", "reviewer"]);

export async function approveUser(formData: FormData) {
  const { supabase } = await requireAdmin();

  const userId = z.uuid().safeParse(formData.get("userId"));
  if (!userId.success) redirect("/admin/users?error=invalid");

  const assignments: { group_id: string; role: "writer" | "reviewer" }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("role:") || !value) continue;
    const groupId = z.uuid().safeParse(key.slice("role:".length));
    const role = roleSchema.safeParse(value);
    if (!groupId.success || !role.success) redirect("/admin/users?error=invalid");
    assignments.push({ group_id: groupId.data, role: role.data });
  }
  const makeAdmin = formData.get("makeAdmin") === "on";
  if (!assignments.length && !makeAdmin) redirect("/admin/users?error=no-group");

  const { error } = await supabase.rpc("approve_user", {
    p_user: userId.data,
    p_assignments: assignments,
    p_make_admin: makeAdmin,
  });
  if (error) redirect("/admin/users?error=save");
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
  const { supabase } = await requireAdmin();
  const userId = z.uuid().safeParse(formData.get("userId"));
  if (!userId.success) redirect("/admin/users?error=invalid");
  const path = `/admin/users/${userId.data}`;

  const assignments: { group_id: string; role: "writer" | "reviewer" }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("role:") || !value) continue;
    const groupId = z.uuid().safeParse(key.slice("role:".length));
    const role = roleSchema.safeParse(value);
    if (!groupId.success || !role.success) redirect(`${path}?error=invalid`);
    assignments.push({ group_id: groupId.data, role: role.data });
  }

  const { error } = await supabase.rpc("set_memberships", { p_user: userId.data, p_assignments: assignments });
  if (error) redirect(`${path}?error=save`);
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
