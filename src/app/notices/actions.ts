"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActive } from "@/lib/auth";
import { notifyNotice, notifyUsers } from "@/lib/notices";

export async function createNotice(formData: FormData) {
  const { supabase, profile } = await requireActive();
  const parsed = z.object({
    target: z.string().regex(/^type:(education|worship|other|campus)$|^group:[0-9a-f-]{36}$/),
    audience: z.enum(["all", "reviewer"]),
    title: z.string().trim().min(1).max(100), body: z.string().trim().min(1).max(2000),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/notices?error=invalid");
  const [kind, value] = parsed.data.target.split(":");
  const { data, error } = await supabase.from("notices").insert({
    author_id: profile.id, target_type: kind === "type" ? value : null,
    target_group_id: kind === "group" ? value : null, audience: parsed.data.audience,
    title: parsed.data.title, body: parsed.data.body,
  }).select("id").single();
  if (error || !data) redirect("/notices?error=save");
  const pushed = await notifyNotice(supabase, data.id, parsed.data.title);
  redirect(`/notices/${data.id}?saved=1${pushed ? "" : "&push=failed"}`);
}

export async function addNoticeComment(formData: FormData) {
  const { supabase, profile } = await requireActive();
  const parsed = z.object({ noticeId: z.uuid(), body: z.string().trim().min(1).max(1000) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/notices?error=invalid");
  const path = `/notices/${parsed.data.noticeId}`;
  const { data: notice } = await supabase.from("notices").select("author_id").eq("id", parsed.data.noticeId).maybeSingle();
  if (!notice) redirect("/notices");
  const { error } = await supabase.from("notice_comments").insert({
    notice_id: parsed.data.noticeId, author_id: profile.id, body: parsed.data.body,
  });
  if (error) redirect(path + "?error=comment");
  const pushed = notice.author_id === profile.id || await notifyUsers([notice.author_id], parsed.data.noticeId, "공지에 댓글이 달렸습니다");
  redirect(path + "?commented=1" + (pushed ? "" : "&push=failed") + "#comments");
}
