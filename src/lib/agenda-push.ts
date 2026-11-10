import "server-only";
import { createAdminClient } from "./supabase/admin";
import { sendToSubscriptions } from "./push";
import { weekOf } from "./week";

// 부서 안건·답글 푸시. 받는 분은 DB 트리거가 알림함에 넣은 분 그대로이고, 안건 본문은 읽지 않는다(알림 문구만 보낸다).
export async function notifyAgenda(agendaId: string, since: string) {
  const admin = createAdminClient();
  const { data: notices, error } = await admin.from("inbox_notifications")
    .select("id,user_id,title,body,url,created_at")
    .eq("agenda_id", agendaId).gte("created_at", since);
  if (error) throw new Error("agenda notification lookup failed");
  for (const notice of notices ?? []) {
    const { data: recipient, error: recipientError } = await admin.from("profiles")
      .select("status,notify_enabled").eq("id", notice.user_id).maybeSingle();
    if (recipientError) throw new Error("agenda recipient lookup failed");
    if (recipient?.status !== "active" || !recipient.notify_enabled) continue;
    const { data: subs, error: subscriptionError } = await admin.from("push_subscriptions")
      .select("id,endpoint,p256dh,auth").eq("user_id", notice.user_id);
    if (subscriptionError) throw new Error("agenda subscription lookup failed");
    if (!subs?.length) continue;
    const key = { user_id: notice.user_id, week: weekOf(notice.created_at.slice(0, 10)), slot: `agenda-push:${notice.id}` };
    const { data: claimed, error: claimError } = await admin.from("notification_logs")
      .upsert(key, { onConflict: "user_id,week,slot", ignoreDuplicates: true }).select("user_id");
    if (claimError) throw new Error("agenda push claim failed");
    if (!claimed?.length) continue;
    // 알림함 알림은 트리거가 이미 만들었으므로 다시 만들지 않는다.
    await sendToSubscriptions(admin, subs, { title: notice.title, body: notice.body, url: notice.url, tag: `agenda:${notice.id}` }, []);
  }
}
