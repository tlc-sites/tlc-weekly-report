"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {loadUnreadNotificationCount} from "@/app/notifications/actions";
export function NotificationBell(){
 const [unread,setUnread]=useState(0);
 useEffect(()=>{let active=true;const update=async()=>{if(document.visibilityState!=="visible")return;try{const count=await loadUnreadNotificationCount();if(active)setUnread(count);}catch{}};void update();const timer=setInterval(update,60000);window.addEventListener("focus",update);return ()=>{active=false;clearInterval(timer);window.removeEventListener("focus",update);};},[]);
 return <Link href="/notifications" prefetch={false} aria-label={unread?`알림, 읽지 않은 알림 ${unread}개`:"알림"} className="relative ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent/10"><svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>{unread?<span className="absolute right-0 top-0 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] text-white">{unread>99?"99+":unread}</span>:null}</Link>;
}
