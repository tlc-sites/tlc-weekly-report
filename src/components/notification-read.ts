"use client";
import {announceNotificationsChanged} from "./notification-panel-store";

// 화면 이동을 막지 않고 읽음만 따로 보낸다. 창을 닫거나 다른 화면으로 가도 요청은 끝까지 간다(keepalive).
export function markNotificationRead(id: string) {
  return fetch("/api/notifications/read", {method: "POST", keepalive: true, headers: {"content-type": "application/json"}, body: JSON.stringify({id})})
    .then(r => { if (r.ok) announceNotificationsChanged(); return r.ok; })
    .catch(() => false);
}
