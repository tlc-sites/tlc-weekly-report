import { Suspense } from "react";
import { BackLink, Card, Loading, PageTitle, secondaryButtonClass } from "@/components/ui";
import { requireActive } from "@/lib/auth";
import { setNotifyEnabled } from "./actions";
import { PushManager } from "./push-manager";
import {HELP} from "@/lib/help-text";

export default function SettingsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SettingsContent />
    </Suspense>
  );
}

async function SettingsContent() {
  const { supabase, profile } = await requireActive();
  const [{ data: me }, { data: devices }] = await Promise.all([
    supabase.from("profiles").select("notify_enabled").eq("id", profile.id).single(),
    supabase.from("push_subscriptions").select("id, device_label, last_success_at, created_at").eq("user_id", profile.id).order("created_at"),
  ]);
  const enabled = me?.notify_enabled ?? true;

  return (
    <>
      <BackLink href="/">홈</BackLink>
      <PageTitle info={HELP.push} sub="수요일·금요일 오전 작성 알림과 금요일 오후 5시 사역 보고 안내를 받습니다.">알림 설정</PageTitle>

      <h2 className="mb-2 text-sm font-semibold">이 기기</h2>
      <Card className="mb-6">
        <PushManager />
      </Card>

      <h2 className="mb-2 text-sm font-semibold">알림 받기</h2>
      <Card className="mb-6 flex items-center justify-between gap-3">
        <p className="text-sm">{enabled ? "모든 기기에서 알림을 받습니다." : "알림을 받지 않도록 꺼 두었습니다."}</p>
        <form action={setNotifyEnabled}>
          <input type="hidden" name="enabled" value={String(!enabled)} />
          <button type="submit" className={`${secondaryButtonClass} h-9 text-xs`}>
            {enabled ? "모든 알림 끄기" : "다시 받기"}
          </button>
        </form>
      </Card>

      <h2 className="mb-2 text-sm font-semibold">알림을 받는 기기 {devices?.length ?? 0}대</h2>
      <Card>
        {devices?.length ? (
          <ul className="flex flex-col divide-y divide-border text-sm">
            {devices.map((d) => (
              <li key={d.id} className="flex justify-between py-2">
                <span>{d.device_label ?? "기기"}</span>
                <span className="text-xs text-muted">
                  {d.last_success_at
                    ? `마지막 수신 ${new Date(d.last_success_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}`
                    : "아직 받은 알림 없음"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">아직 알림을 켠 기기가 없습니다.</p>
        )}
      </Card>
    </>
  );
}
