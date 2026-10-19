"use client";

import { useEffect, useState } from "react";
import { buttonClass, secondaryButtonClass } from "@/components/ui";
import { removePushSubscription, savePushSubscription, sendTestPush } from "./actions";

type State = "loading" | "kakao" | "ios-install" | "unsupported" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "Mac" : "기기";
  const browser = /SamsungBrowser/.test(ua) ? "삼성 인터넷" : /CriOS|Chrome/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "브라우저";
  return `${os} · ${browser}`;
}

// 이 기기에서 알림을 받을 수 있는지와 현재 구독 상태를 확인한다
async function detect(): Promise<{ state: State; sub: PushSubscription | null }> {
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const standalone = window.matchMedia("(display-mode: standalone)").matches;
  if (/KAKAOTALK/i.test(ua)) return { state: "kakao", sub: null };
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { state: isIOS && !standalone ? "ios-install" : "unsupported", sub: null };
  }
  if (Notification.permission === "denied") return { state: "denied", sub: null };
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    const sub = await reg.pushManager.getSubscription();
    return { state: sub ? "on" : "off", sub };
  } catch {
    return { state: "unsupported", sub: null };
  }
}

export function PushManager() {
  const [state, setState] = useState<State>("loading");
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    detect().then(({ state, sub }) => {
      setSubscription(sub);
      setState(state);
    });
  }, []);

  async function turnOn() {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      });
      const result = await savePushSubscription(JSON.parse(JSON.stringify(sub)), deviceLabel());
      if (!result.ok) {
        await sub.unsubscribe();
        setMessage("알림 설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setSubscription(sub);
      setState("on");
      const test = await sendTestPush();
      setMessage(test.sent ? "알림을 켰습니다. 테스트 알림을 보냈어요." : "알림을 켰습니다.");
    } catch {
      setMessage("알림을 켜지 못했습니다. 브라우저 설정에서 알림 권한을 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    if (!subscription) return;
    setBusy(true);
    await removePushSubscription(subscription.endpoint);
    await subscription.unsubscribe();
    setSubscription(null);
    setState("off");
    setMessage("이 기기의 알림을 껐습니다.");
    setBusy(false);
  }

  async function test() {
    setBusy(true);
    const r = await sendTestPush();
    setMessage(r.sent ? "테스트 알림을 보냈습니다." : "보낼 수 있는 기기가 없습니다. 알림을 다시 켜 주세요.");
    setBusy(false);
  }

  const guide: Partial<Record<State, string>> = {
    loading: "확인 중…",
    kakao: "카카오톡 안에서는 알림을 받을 수 없습니다. 오른쪽 위 ⋮ 메뉴에서 '다른 브라우저로 열기'를 눌러 Chrome이나 Safari로 열어 주세요.",
    "ios-install": "아이폰은 홈 화면에 추가한 앱에서만 알림을 받을 수 있습니다. Safari 아래쪽 공유 버튼(□↑) → '홈 화면에 추가'를 누른 뒤, 홈 화면의 '교회 보고' 앱에서 다시 이 화면을 열어 주세요.",
    unsupported: "이 브라우저는 알림을 지원하지 않습니다. 안드로이드는 Chrome, 아이폰은 홈 화면에 추가한 앱을 사용해 주세요.",
    denied: "알림이 차단되어 있습니다. 브라우저(또는 휴대폰) 설정에서 이 사이트의 알림을 허용한 뒤 다시 열어 주세요.",
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        {state === "on" ? (
          <>
            <strong className="text-accent">이 기기에서 알림을 받고 있습니다.</strong>
          </>
        ) : state === "off" ? (
          "이 기기에서는 알림이 꺼져 있습니다."
        ) : (
          guide[state]
        )}
      </p>
      {state === "off" ? (
        <button type="button" onClick={turnOn} disabled={busy} className={buttonClass}>
          이 기기에서 알림 켜기
        </button>
      ) : null}
      {state === "on" ? (
        <div className="flex gap-2">
          <button type="button" onClick={test} disabled={busy} className={`${secondaryButtonClass} flex-1`}>
            테스트 알림
          </button>
          <button type="button" onClick={turnOff} disabled={busy} className={`${secondaryButtonClass} flex-1`}>
            이 기기 알림 끄기
          </button>
        </div>
      ) : null}
      {message ? <p className="text-sm text-muted">{message}</p> : null}
    </div>
  );
}
