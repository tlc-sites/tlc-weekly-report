"use client";
import {useSyncExternalStore} from "react";

// PC 가운데 칸을 알림 목록으로 쓸지. 사이드바 종과 가운데 칸이 함께 본다. 새로고침해도 이 탭에서는 유지한다.
const KEY = "tlc-notification-panel";
const listeners = new Set<() => void>();
let open: boolean | null = null;
const read = () => { if (open === null) { try { open = sessionStorage.getItem(KEY) === "1"; } catch { open = false; } } return open; };

export function setNotificationPanel(next: boolean) {
  open = next;
  try { if (next) sessionStorage.setItem(KEY, "1"); else sessionStorage.removeItem(KEY); } catch {}
  listeners.forEach(l => l());
}
export function useNotificationPanel() {
  return useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, read, () => false);
}

// 알림을 읽으면 종의 숫자도 바로 다시 센다.
export const NOTIFICATIONS_CHANGED = "tlc-notifications-changed";
export const announceNotificationsChanged = () => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
