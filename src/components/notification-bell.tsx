"use client";
import Link from "@/components/pending-link";
import {useEffect,useState} from "react";
import {loadUnreadNotificationCount} from "@/app/notifications/actions";
import {useAppUpdates} from "./app-updates";
import {NOTIFICATIONS_CHANGED,setNotificationPanel,useNotificationPanel} from "./notification-panel-store";
// panel: PC 사이드바의 종. 넓은 화면(1280px 이상)에서는 알림 화면으로 가지 않고 가운데 칸을 알림 목록으로 바꾼다.
export function NotificationBell({userId,staff,panel=false}:{userId:string;staff:boolean;panel?:boolean}){
 const panelOpen=useNotificationPanel();
 const [inboxUnread,setUnread]=useState(0);const updates=useAppUpdates(userId,staff);const unread=inboxUnread+updates.unread;
 useEffect(()=>{let active=true;const update=async()=>{if(document.visibilityState!=="visible")return;try{const count=await loadUnreadNotificationCount();if(active)setUnread(count);}catch{}};void update();const timer=setInterval(update,60000);window.addEventListener("focus",update);window.addEventListener(NOTIFICATIONS_CHANGED,update);return ()=>{active=false;clearInterval(timer);window.removeEventListener("focus",update);window.removeEventListener(NOTIFICATIONS_CHANGED,update);};},[]);
 return <Link href="/notifications" prefetch={false} aria-label={unread?`알림, 읽지 않은 알림 ${unread}개`:"알림"} aria-pressed={panel?panelOpen:undefined} data-on={panel&&panelOpen?"":undefined} onClick={panel?e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||!matchMedia("(min-width: 1280px)").matches)return;e.preventDefault();setNotificationPanel(!panelOpen);}:undefined} className="relative ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent/10"><svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>{unread?<span className="absolute right-0 top-0 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] text-white">{unread>99?"99+":unread}</span>:null}</Link>;
}
