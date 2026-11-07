"use client";
import {usePathname} from "next/navigation";
import {useEffect} from "react";
import {announceNotificationsChanged} from "./notification-panel-store";

// 알림이 가리키는 화면(보고서·이슈·공지·메시지)을 열면, 그 화면을 가리키는 내 안 읽은 알림을 모두 읽음으로 바꾼다.
// 휴대폰 푸시나 홈에서 바로 들어가 읽었는데 알림함에 '새 알림'이 남던 문제, 같은 보고서의 알림이 여러 개일 때 하나만 읽히던 문제를 막는다.
const SEEN_PATH = /^\/(reports|incidents|notices|messages)\/[0-9a-f-]{36}$/i;
export function NotificationSeen() {
  const path = usePathname();
  useEffect(() => {
    if (!SEEN_PATH.test(path)) return;
    fetch("/api/notifications/read", {method: "POST", keepalive: true, headers: {"content-type": "application/json"}, body: JSON.stringify({path})})
      .then(r => (r.ok ? r.json() : null)).then(v => { if (v?.read) announceNotificationsChanged(); }).catch(() => {});
  }, [path]);
  return null;
}
