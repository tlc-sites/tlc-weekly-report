"use client";
import Link from "@/components/pending-link";
import {usePathname,useRouter} from "next/navigation";
import {useCallback,useEffect,useState} from "react";
import {loadNotifications} from "@/app/notifications/actions";
import {NOTIFICATION_CATEGORIES,notificationCategory,type NotificationCategory} from "@/lib/notification-category";
import type {NotificationItem} from "./notification-list";
import {setNotificationPanel} from "./notification-panel-store";
import {markNotificationRead} from "./notification-read";

const when = (iso: string) => {
 const d = new Date(iso), now = Date.now(), min = Math.round((now - d.getTime()) / 60000);
 if (min < 1) return "방금";
 if (min < 60) return `${min}분 전`;
 if (min < 60 * 24) return `${Math.round(min / 60)}시간 전`;
 return d.toLocaleDateString("ko-KR", {timeZone: "Asia/Seoul", month: "numeric", day: "numeric"});
};
const safe = (url: string) => (url.startsWith("/") && !url.startsWith("//") ? url : "/");

// PC 가운데 칸 알림 목록: 알림을 누르면 오른쪽 본문에 그 내용이 열리고, 목록은 그대로 남아 다음 알림으로 넘어갈 수 있다.
export function DesktopNotificationColumn({initialItems = null}: {initialItems?: NotificationItem[] | null}) {
 const router = useRouter();
 const path = usePathname();
 const [items, setItems] = useState<NotificationItem[] | null>(initialItems);
 const [failed, setFailed] = useState(false);
 const [filter, setFilter] = useState<NotificationCategory | "all" | "unread">("all");
 const [opened, setOpened] = useState<string | null>(null);
 const load = useCallback(async () => {
  if (document.visibilityState !== "visible") return;
  try { setItems(await loadNotifications()); setFailed(false); } catch { setFailed(true); }
 }, []);
 useEffect(() => {
  // 처음 한 번과 1분마다, 창으로 돌아올 때 다시 불러온다. 첫 호출도 타이머로 미뤄 렌더 중 상태 변경을 피한다.
  const first = setTimeout(load, 0), timer = setInterval(load, 60000);
  window.addEventListener("focus", load);
  return () => { clearTimeout(first); clearInterval(timer); window.removeEventListener("focus", load); };
 }, [load]);
 const list = items ?? [];
 const unread = list.filter(i => !i.read_at).length;
 const cats = NOTIFICATION_CATEGORIES.filter(([k]) => list.some(i => notificationCategory(i) === k));
 const shown = filter === "all" ? list : filter === "unread" ? list.filter(i => !i.read_at) : list.filter(i => notificationCategory(i) === filter);
 const open = async (item: NotificationItem) => {
  setOpened(item.id);
  router.push(safe(item.url));
  if (!item.read_at) {
   setItems(prev => prev?.map(i => (i.id === item.id ? {...i, read_at: new Date().toISOString()} : i)) ?? prev);
   void markNotificationRead(item.id);
  }
 };
 return <aside data-print-hide className="app-listcol" aria-label="알림 목록">
  <div className="app-listcol-head">
   <Link href="/notifications" className="min-w-0 flex-1"><b>알림</b><small>{items ? (unread ? `안 읽은 알림 ${unread}개` : "모두 읽음") : " "}</small></Link>
   <button type="button" className="app-listcol-close" onClick={() => setNotificationPanel(false)} aria-label="알림 목록 닫기" title="닫기">×</button>
  </div>
  <div className="app-listcol-tabs" role="tablist" aria-label="알림 거르기">
   {([["all", "전체", list.length], ["unread", "안 읽음", unread], ...cats.map(([k, label]) => [k, label, list.filter(i => notificationCategory(i) === k).length] as const)] as const).map(([k, label, n]) =>
    <button key={k} type="button" role="tab" aria-selected={filter === k} className={filter === k ? "is-on" : ""} onClick={() => setFilter(k as typeof filter)}>{label}{items ? <span>{n}</span> : null}</button>)}
  </div>
  <div className="app-listcol-rows">
   {failed && !items ? <p className="app-listcol-empty">알림을 불러오지 못했습니다. 새로고침해 주세요.</p>
    : !items ? <p className="app-listcol-empty">불러오는 중…</p>
    : !shown.length ? <p className="app-listcol-empty">{filter === "all" ? "아직 받은 알림이 없습니다." : "이 종류의 알림이 없습니다."}</p>
    : shown.map(item => {
     const href = safe(item.url), on = opened === item.id && path === href.split(/[?#]/)[0];
     return <a key={item.id} href={href} aria-current={on ? "page" : undefined} className={"app-notif-row" + (item.read_at ? "" : " is-unread")}
      onClick={e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); void open(item); }}>
      <span className="app-notif-dot" aria-hidden="true"/>
      <span className="min-w-0 flex-1">
       <span className="app-notif-title">{item.title}{item.read_at ? null : <span className="sr-only"> (새 알림)</span>}</span>
       {item.body ? <span className="app-notif-body">{item.body}</span> : null}
       <span className="app-listcol-meta">{when(item.created_at)}</span>
      </span>
     </a>;
    })}
  </div>
  <Link href="/notifications" className="app-listcol-foot">알림 전체 화면 · 앱 소식 보기 ›</Link>
 </aside>;
}
