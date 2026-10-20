import { notFound } from "next/navigation";
import { getGroup, type ReportClient } from "./groups";

// 그룹 열람·검토 권한 확인 (실제 차단은 DB의 RLS가 하고, 여기서는 화면 분기용)
export async function getGroupAccess(supabase: ReportClient, groupId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(groupId)) notFound();

  const [group, view, write, review, children] = await Promise.all([
    getGroup(supabase, groupId),
    supabase.rpc("can_view_group", { gid: groupId }),
    supabase.rpc("can_write_group", { gid: groupId }),
    supabase.rpc("can_review_group", { gid: groupId }),
    supabase.from("groups").select("id", { count: "exact", head: true }).eq("parent_id", groupId),
  ]);
  if (!group || !view.data) notFound();

  return {
    group,
    canView: Boolean(view.data),
    canWrite: Boolean(write.data),
    canReview: Boolean(review.data),
    isLeaf: (children.count ?? 0) === 0,
  };
}
