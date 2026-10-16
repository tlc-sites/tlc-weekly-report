"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import type { ServiceType } from "@/lib/services";

const fields = z.object({
  name: z.string().trim().min(1).max(50),
  weekday: z.union([z.coerce.number().int().min(0).max(6), z.literal("")]),
});

function readFields(formData: FormData) {
  return fields.safeParse({
    name: formData.get("name"),
    weekday: formData.get("weekday") ?? "",
  });
}

export async function createService(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = readFields(formData);
  if (!parsed.success) redirect("/admin/services?error=invalid");

  const { data: last } = await supabase
    .from("service_types")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase.from("service_types").insert({
    name: parsed.data.name,
    weekday: parsed.data.weekday === "" ? null : parsed.data.weekday,
    sort_order: (last?.sort_order ?? 0) + 1,
  });
  if (error) redirect("/admin/services?error=save");
  refresh();
}

export async function updateService(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = z.uuid().safeParse(formData.get("id"));
  const parsed = readFields(formData);
  if (!id.success || !parsed.success) redirect("/admin/services?error=invalid");

  const { error } = await supabase
    .from("service_types")
    .update({
      name: parsed.data.name,
      weekday: parsed.data.weekday === "" ? null : parsed.data.weekday,
    })
    .eq("id", id.data);
  if (error) redirect("/admin/services?error=save");
  refresh();
}

export async function toggleService(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = z
    .object({ id: z.uuid(), isActive: z.enum(["true", "false"]) })
    .safeParse({ id: formData.get("id"), isActive: formData.get("isActive") });
  if (!parsed.success) redirect("/admin/services?error=invalid");

  const { error } = await supabase
    .from("service_types")
    .update({ is_active: parsed.data.isActive === "true" })
    .eq("id", parsed.data.id);
  if (error) redirect("/admin/services?error=save");
  refresh();
}

// 위·아래 이웃과 순서를 바꾼다. 순서 값이 겹쳐 있으면 먼저 1부터 다시 매긴다.
export async function moveService(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = z
    .object({ id: z.uuid(), direction: z.enum(["up", "down"]) })
    .safeParse({ id: formData.get("id"), direction: formData.get("direction") });
  if (!parsed.success) redirect("/admin/services?error=invalid");

  const { data, error } = await supabase.from("service_types").select("id, sort_order").order("sort_order").order("name");
  if (error || !data) redirect("/admin/services?error=save");
  const list = data as Pick<ServiceType, "id" | "sort_order">[];
  const index = list.findIndex((s) => s.id === parsed.data.id);
  const target = parsed.data.direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= list.length) return;

  const reordered = [...list];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  const updates = reordered
    .map((s, i) => ({ id: s.id, sort_order: i + 1 }))
    .filter((s, i) => list.find((o) => o.id === s.id)?.sort_order !== i + 1);

  for (const u of updates) {
    const { error: updateError } = await supabase.from("service_types").update({ sort_order: u.sort_order }).eq("id", u.id);
    if (updateError) redirect("/admin/services?error=save");
  }
  refresh();
}
