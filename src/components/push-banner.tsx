"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// 이 기기에서 알림을 아직 켜지 않았으면 설정 화면으로 안내한다 (지원하지 않는 환경에서도 안내)
async function shouldShow() {
  try {
    if (localStorage.getItem("push-banner-dismissed") === "1") return false;
  } catch {}
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return true;
  if (Notification.permission === "denied") return false;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    return !(await reg.pushManager.getSubscription());
  } catch {
    return false;
  }
}

export function PushBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    shouldShow().then(setShow);
  }, []);

  if (!show) return null;
  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 p-3 text-sm">
      <Link href="/settings" className="flex-1">
        <strong>알림을 켜 주세요.</strong> 월요일 미제출 알림을 받을 수 있습니다. ›
      </Link>
      <button
        type="button"
        aria-label="닫기"
        onClick={() => {
          try {
            localStorage.setItem("push-banner-dismissed", "1");
          } catch {}
          setShow(false);
        }}
        className="text-muted"
      >
        ✕
      </button>
    </div>
  );
}
