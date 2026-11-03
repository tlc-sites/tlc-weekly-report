"use client";
import Link from "@/components/pending-link";
import {useRouter} from "next/navigation";
import {useMemo,useState,useTransition} from "react";
import {readNotification} from "@/app/notifications/actions";
import {smallButtonClass} from "./ui";
import {AppUpdateList,useAppUpdates} from "./app-updates";
import {NOTIFICATION_CATEGORIES,notificationCategory,type NotificationCategory} from "@/lib/notification-category";
export type NotificationItem={id:string;title:string;body:string;url:string;read_at:string|null;created_at:string};
export function NotificationList({items,userId,staff}:{items:NotificationItem[];userId:string;staff:boolean}){
 const updates=useAppUpdates(userId,staff);
 const [refreshing,startRefresh]=useTransition();
 const router=useRouter();const [opening,setOpening]=useState<string|null>(null);
 // 상단 종류별 모아보기: 알림이 있는 종류만 버튼으로 보이고, 괄호 안은 안 읽은 수다.
 const [filter,setFilter]=useState<NotificationCategory|"all"|"unread">("all");
 const counted=useMemo(()=>{const map=new Map<NotificationCategory,{total:number;unread:number}>();for(const item of items){const c=notificationCategory(item);const v=map.get(c)??{total:0,unread:0};v.total++;if(!item.read_at)v.unread++;map.set(c,v);}return map;},[items]);
 const unread=items.filter(i=>!i.read_at).length;
 const shown=filter==="all"?items:filter==="unread"?items.filter(i=>!i.read_at):items.filter(i=>notificationCategory(i)===filter);
 const chip=(key:typeof filter,label:string,total:number,fresh:number)=><button key={key} type="button" aria-pressed={filter===key} onClick={()=>setFilter(key)} className={`inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full border px-3 text-sm font-medium transition ${filter===key?"border-accent bg-accent text-accent-foreground":"border-border bg-surface text-foreground hover:border-accent/40"}`}>{label}<span className={filter===key?"text-accent-foreground/80":"text-muted"}>{total}</span>{fresh?<span className={`rounded-full px-1.5 text-xs font-semibold ${filter===key?"bg-accent-foreground/20 text-accent-foreground":"bg-accent/10 text-accent"}`}>새 {fresh}</span>:null}</button>;
 return <><button type="button" disabled={refreshing} aria-busy={refreshing} onClick={()=>startRefresh(()=>router.refresh())} className={smallButtonClass+" mb-4 self-start"}>{refreshing?"새로고침 중…":"새로고침"}</button><AppUpdateList userId={userId} staff={staff}/>{items.length?<nav aria-label="알림 종류별 모아보기" className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">{chip("all","전체",items.length,unread)}{unread?chip("unread","안 읽음",unread,0):null}{NOTIFICATION_CATEGORIES.filter(([key])=>counted.has(key)).map(([key,label])=>chip(key,label,counted.get(key)!.total,counted.get(key)!.unread))}</nav>:null}{!items.length&&!updates.items.length?<p className="text-sm text-muted">아직 받은 알림이 없습니다.</p>:!items.length?null:!shown.length?<p className="text-sm text-muted">이 종류의 알림이 없습니다.</p>:<ul className="space-y-3">{shown.map(item=>{const href=item.url.startsWith("/")&&!item.url.startsWith("//")?item.url:"/";return <li key={item.id}><Link href={href} prefetch={false} className="block rounded-2xl border border-border bg-surface p-4 transition hover:border-accent/40 focus-visible:outline-2 focus-visible:outline-accent active:bg-accent/5 sm:p-5" onClick={async event=>{if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();if(opening)return;setOpening(item.id);try{await readNotification(item.id);}catch{}router.push(href);}}><div className="flex flex-wrap items-center gap-2"><h2 className="min-w-0 break-words font-semibold">{item.title}</h2>{!item.read_at?<span className="shrink-0 rounded-full bg-accent/10 px-2 py-1 text-xs font-semibold text-accent">새 알림</span>:null}</div><p className="my-3 whitespace-pre-wrap break-words text-sm">{item.body}</p><p className="text-xs text-muted">{opening===item.id?"이동 중…":new Date(item.created_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul",month:"long",day:"numeric",hour:"numeric",minute:"2-digit"})}</p></Link></li>;})}</ul>}</>;
}
