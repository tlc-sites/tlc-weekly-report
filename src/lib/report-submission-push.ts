import "server-only";
import { createAdminClient } from "./supabase/admin";
import { sendToSubscriptions } from "./push";
import { weekOf } from "./week";

// 저장 트리거가 정한 수신자와 안전한 안내 문구만 전달한다. 보고 본문은 읽지 않는다.
export async function notifyReportSubmission(reportId: string, since: string) {
  const admin = createAdminClient();
  const { data: notices, error } = await admin.from("inbox_notifications")
    .select("id,user_id,title,body,url,created_at")
    .eq("report_id", reportId).not("report_event_key", "is", null).gte("created_at", since);
  if (error) throw new Error("report notification lookup failed");
  for (const notice of notices ?? []) {
    const { data: recipient, error: recipientError } = await admin.from("profiles")
      .select("status,notify_enabled").eq("id", notice.user_id).maybeSingle();
    if (recipientError) throw new Error("report recipient lookup failed");
    if (recipient?.status !== "active" || !recipient.notify_enabled) continue;
    const { data: subs, error: subscriptionError } = await admin.from("push_subscriptions")
      .select("id,endpoint,p256dh,auth").eq("user_id", notice.user_id);
    if (subscriptionError) throw new Error("report subscription lookup failed");
    if (!subs?.length) continue;
    const key = { user_id: notice.user_id, week: weekOf(notice.created_at.slice(0, 10)), slot: `report-push:${notice.id}` };
    const { data: claimed, error: claimError } = await admin.from("notification_logs")
      .upsert(key, { onConflict: "user_id,week,slot", ignoreDuplicates: true }).select("user_id");
    if (claimError) throw new Error("report push claim failed");
    if (!claimed?.length) continue;
    // 기존 종 알림을 다시 생성하지 않는다.
    await sendToSubscriptions(admin, subs, {
      title: notice.title, body: notice.body, url: notice.url, tag: `report:${notice.id}`,
    }, []);
  }
}
