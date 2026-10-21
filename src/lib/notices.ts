import "server-only";
import type { ReportClient } from "./groups";
import { createAdminClient } from "./supabase/admin";
import { sendToSubscriptions } from "./push";

// 공지는 RLS로 먼저 저장한 뒤, 저장된 공지의 수신 대상에게만 서버 키로 푸시한다.
export async function notifyNotice(supabase: ReportClient, noticeId: string, title: string) {
  const { data, error } = await supabase.rpc("notice_recipients", { p_notice: noticeId });
  if (error) return false;
  return notifyUsers((data ?? []).map((r: { user_id: string }) => r.user_id), noticeId, title);
}

export async function notifyUsers(userIds: string[], noticeId: string, title: string) {
  if (!userIds.length) return true;
  try {
    const admin = createAdminClient();
    const { data: users, error } = await admin.from("profiles").select("id").in("id", userIds).eq("status", "active").eq("notify_enabled", true);
    if (error) return false;
    const targets = (users ?? []).map(u => u.id);
    if (!targets.length) return true;
    const { data: subs, error: subsError } = await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").in("user_id", targets);
    if (subsError) return false;

    const result = await sendToSubscriptions(admin, subs ?? [], {
      title, body: "앱에서 공지와 댓글을 확인해 주세요.", url: `/notices/${noticeId}`, tag: `notice:${noticeId}`,
    }, targets);
    return result.failed === 0;
  } catch {
    // 공지는 보존하고 푸시 실패만 별도로 안내한다. 재제출로 공지가 중복되지 않게 한다.
    return false;
  }
}
