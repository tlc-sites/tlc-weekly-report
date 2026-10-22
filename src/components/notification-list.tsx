"use client";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {useState} from "react";
import {readNotification} from "@/app/notifications/actions";
import {smallButtonClass} from "./ui";
export type NotificationItem={id:string;title:string;body:string;url:string;read_at:string|null;created_at:string};
export function NotificationList({items}:{items:NotificationItem[]}){
 const router=useRouter();const [opening,setOpening]=useState<string|null>(null);
 return <><button type="button" onClick={()=>router.refresh()} className={smallButtonClass+" mb-4 self-start"}>새로고침</button>{!items.length?<p className="text-sm text-muted">아직 받은 알림이 없습니다.</p>:<ul className="space-y-3">{items.map(item=>{const href=item.url.startsWith("/")&&!item.url.startsWith("//")?item.url:"/";return <li key={item.id}><Link href={href} prefetch={false} className="block rounded-2xl border border-border bg-surface p-4 transition hover:border-accent/40 focus-visible:outline-2 focus-visible:outline-accent active:bg-accent/5 sm:p-5" onClick={async event=>{if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();if(opening)return;setOpening(item.id);try{await readNotification(item.id);}catch{}router.push(href);}}><div className="flex flex-wrap items-center gap-2"><h2 className="min-w-0 break-words font-semibold">{item.title}</h2>{!item.read_at?<span className="shrink-0 rounded-full bg-accent/10 px-2 py-1 text-xs font-semibold text-accent">새 알림</span>:null}</div><p className="my-3 whitespace-pre-wrap break-words text-sm">{item.body}</p><p className="text-xs text-muted">{opening===item.id?"이동 중…":new Date(item.created_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul",month:"long",day:"numeric",hour:"numeric",minute:"2-digit"})}</p></Link></li>;})}</ul>}</>;
}
