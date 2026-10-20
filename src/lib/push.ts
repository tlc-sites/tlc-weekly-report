import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PushPayload = { title: string; body: string; url: string; tag?: string };
type Subscription = { id: string; endpoint: string; p256dh: string; auth: string };

let configured = false;
function configure() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY 환경변수가 필요합니다.");
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", publicKey, privateKey);
  configured = true;
}

// 구독 목록에 알림을 보낸다. 만료된 구독(404/410)은 지우고, 성공하면 마지막 성공 시각을 남긴다.
// client는 관리자 클라이언트이거나, 본인 구독만 다루는 경우 로그인한 사용자의 클라이언트다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sendToSubscriptions(client: SupabaseClient<any, any, any>, subs: Subscription[], payload: PushPayload) {
  configure();
  let sent = 0;
  let removed = 0;
  let failed = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), {
          TTL: 60 * 60 * 12,
        });
        sent++;
        await client.from("push_subscriptions").update({ last_success_at: new Date().toISOString() }).eq("id", s.id);
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          removed++;
          await client.from("push_subscriptions").delete().eq("id", s.id);
        } else {
          failed++;
          console.error("[push] 발송 실패", status ?? "unknown");
        }
      }
    }),
  );
  return { sent, removed, failed };
}
