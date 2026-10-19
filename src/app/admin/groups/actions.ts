"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getGroup } from "@/lib/groups";

const name = z.string().trim().min(1).max(50);
const schedule = z.enum(["weekly", "irregular"]);

// DB 트리거(validate_group)가 보내는 오류를 화면 문구 코드로 바꾼다
const TRIGGER_ERRORS: [RegExp, string][] = [
  [/하위 그룹 아래에는/, "nested"],
  [/유형이 같아야/, "type-mismatch"],
  [/다른 그룹 아래로 옮길 수 없습니다/, "has-children"],
  [/유형을 바꿀 수 없습니다/, "type-locked"],
];

function failTo(path: string, message = ""): never {
  const code = TRIGGER_ERRORS.find(([pattern]) => pattern.test(message))?.[1] ?? "save";
  redirect(`${path}?error=${code}`);
}

export async function createGroup(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = z
    .object({
      name,
      type: z.enum(["education", "worship", "other", "campus"]),
      parentId: z.union([z.uuid(), z.literal("")]),
      schedule,
    })
    .safeParse({
      name: formData.get("name"),
      type: formData.get("type"),
      parentId: formData.get("parentId") ?? "",
      schedule: formData.get("schedule"),
    });
  if (!parsed.success) redirect("/admin/groups?error=invalid");

  let type = parsed.data.type;
  if (parsed.data.parentId) {
    const parent = await getGroup(supabase, parsed.data.parentId);
    if (!parent) redirect("/admin/groups?error=invalid");
    type = parent.type; // 하위 그룹은 상위 그룹 유형을 따른다
  }

  // 같은 상위 그룹 안에서 맨 뒤에 붙인다
  let siblings = supabase.from("groups").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  siblings = parsed.data.parentId ? siblings.eq("parent_id", parsed.data.parentId) : siblings.is("parent_id", null);
  const { data: last } = await siblings.maybeSingle();

  const { error } = await supabase.from("groups").insert({
    name: parsed.data.name,
    type,
    parent_id: parsed.data.parentId || null,
    schedule: parsed.data.schedule,
    sort_order: (last?.sort_order ?? 0) + 1,
  });
  if (error) failTo("/admin/groups", error.message);
  refresh();
}

export async function updateGroup(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = z
    .object({
      id: z.uuid(),
      name,
      schedule,
      sortOrder: z.coerce.number().int().min(0).max(9999),
      isActive: z.boolean(),
      guardianCheck: z.boolean(),
    })
    .safeParse({
      id: formData.get("id"),
      name: formData.get("name"),
      schedule: formData.get("schedule"),
      sortOrder: formData.get("sortOrder"),
      isActive: formData.get("isActive") === "on",
      guardianCheck: formData.get("guardianCheck") === "on",
    });
  if (!parsed.success) redirect(`/admin/groups/${formData.get("id")}?error=invalid`);
  const { id, ...v } = parsed.data;
  const path = `/admin/groups/${id}`;

  const group = await getGroup(supabase, id);
  if (!group) redirect("/admin/groups");

  const { error } = await supabase
    .from("groups")
    .update({
      name: v.name,
      schedule: v.schedule,
      sort_order: v.sortOrder,
      is_active: v.isActive,
      settings: { ...group.settings, guardian_check: group.type === "education" ? v.guardianCheck : undefined },
    })
    .eq("id", id);
  if (error) failTo(path, error.message);
  redirect(`${path}?saved=1`);
}

export async function setGroupServices(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) redirect("/admin/groups");
  const serviceIds = z.array(z.uuid()).safeParse(formData.getAll("serviceIds"));
  const path = `/admin/groups/${id.data}`;
  if (!serviceIds.success) redirect(`${path}?error=invalid`);

  const { error: delError } = await supabase.from("group_service_types").delete().eq("group_id", id.data);
  if (delError) failTo(path, delError.message);
  if (serviceIds.data.length) {
    const { error } = await supabase
      .from("group_service_types")
      .insert(serviceIds.data.map((service_type_id) => ({ group_id: id.data, service_type_id })));
    if (error) failTo(path, error.message);
  }
  redirect(`${path}?saved=1`);
}

export async function addMeetingType(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = z
    .object({
      groupId: z.uuid(),
      name,
      weekday: z.union([z.coerce.number().int().min(0).max(6), z.literal("")]),
    })
    .safeParse({
      groupId: formData.get("groupId"),
      name: formData.get("name"),
      weekday: formData.get("weekday") ?? "",
    });
  if (!parsed.success) redirect(`/admin/groups/${formData.get("groupId")}?error=invalid`);
  const path = `/admin/groups/${parsed.data.groupId}`;

  const { error } = await supabase.from("group_meeting_types").insert({
    group_id: parsed.data.groupId,
    name: parsed.data.name,
    weekday: parsed.data.weekday === "" ? null : parsed.data.weekday,
  });
  if (error) failTo(path, error.message);
  refresh();
}

export async function toggleMeetingType(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = z
    .object({ id: z.uuid(), groupId: z.uuid(), isActive: z.enum(["true", "false"]) })
    .safeParse({ id: formData.get("id"), groupId: formData.get("groupId"), isActive: formData.get("isActive") });
  if (!parsed.success) redirect("/admin/groups");

  const { error } = await supabase
    .from("group_meeting_types")
    .update({ is_active: parsed.data.isActive === "true" })
    .eq("id", parsed.data.id);
  if (error) failTo(`/admin/groups/${parsed.data.groupId}`, error.message);
  refresh();
}

export async function archiveGroup(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) redirect("/admin/groups?error=invalid");
  const { error } = await supabase.rpc("archive_group", { p_group: id.data });
  if (error) redirect("/admin/groups/" + id.data + "?error=save");
  redirect("/admin/groups");
}
