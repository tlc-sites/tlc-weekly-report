"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireActive } from "@/lib/auth";
import { sendToSubscriptions } from "@/lib/push";

const subscriptionSchema = z.object({
  endpoint: z.url().startsWith("https://").max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

export async function savePushSubscription(raw: unknown, deviceLabel: string) {
  const { supabase } = await requireActive();
  const parsed = subscriptionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const };

  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.keys.p256dh,
    p_auth: parsed.data.keys.auth,
    p_device_label: deviceLabel.slice(0, 100),
  });
  return { ok: !error };
}

export async function removePushSubscription(endpoint: string) {
  const { supabase } = await requireActive();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return { ok: true as const };
}

// 내 기기로 테스트 알림 (본인 구독만 다루므로 로그인한 사용자의 권한으로 충분하다)
export async function sendTestPush() {
  const { supabase, profile } = await requireActive();
  const { data: subs } = await supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", profile.id);
  if (!subs?.length) return { sent: 0, removed: 0, failed: 0 };
  return sendToSubscriptions(supabase, subs, {
    title: "교회 보고 테스트 알림",
    body: "이 기기에서 알림을 받을 수 있습니다.",
    url: "/settings",
    tag: "test",
  });
}

export async function setNotifyEnabled(formData: FormData) {
  const { supabase, profile } = await requireActive();
  await supabase.from("profiles").update({ notify_enabled: formData.get("enabled") === "true" }).eq("id", profile.id);
  refresh();
}
