"use client";
import {useRouter} from "next/navigation";
import {useEffect,useLayoutEffect,useMemo,useRef,useState,useTransition} from "react";
import {smallButtonClass} from "./ui";
import {AppUpdateList,useAppUpdates} from "./app-updates";
import {markNotificationRead} from "./notification-read";
import {loadNotifications} from "@/app/notifications/actions";
import {NOTIFICATION_CATEGORIES,notificationCategory,type NotificationCategory} from "@/lib/notification-category";
export type NotificationItem={id:string;title:string;body:string;url:string;read_at:string|null;created_at:string;context?:string|null};

// 왼쪽으로 밀면(스와이프) 읽음 처리. 조금만 밀면 원래대로 돌아가고, 민 뒤에는 눌림으로 치지 않는다.
const SWIPE_READ=72;
function SwipeRow({unread,onRead,children}:{unread:boolean;onRead:()=>void;children:React.ReactNode}){
 const [dx,setDx]=useState(0);
 const start=useRef<{x:number;y:number;dir:"x"|"y"|null}|null>(null);
 const swiped=useRef(false);
 return <li className="relative overflow-hidden rounded-2xl" style={{touchAction:"pan-y"}}
  onTouchStart={e=>{const t=e.touches[0];start.current={x:t.clientX,y:t.clientY,dir:null};swiped.current=false;}}
  onTouchMove={e=>{const s=start.current;if(!s)return;const t=e.touches[0],mx=t.clientX-s.x,my=t.clientY-s.y;
   if(!s.dir&&(Math.abs(mx)>8||Math.abs(my)>8))s.dir=Math.abs(mx)>Math.abs(my)?"x":"y";
   if(s.dir==="x"){swiped.current=true;setDx(Math.max(-120,Math.min(0,mx)));}}}
  onTouchEnd={()=>{if(dx<=-SWIPE_READ&&unread)onRead();setDx(0);start.current=null;}}
  onTouchCancel={()=>{setDx(0);start.current=null;}}
  onClickCapture={e=>{if(swiped.current){e.preventDefault();e.stopPropagation();swiped.current=false;}}}>
  <div aria-hidden="true" className={"absolute inset-0 flex items-center justify-end rounded-2xl pr-5 text-sm font-semibold "+(unread?"bg-accent text-accent-foreground":"bg-border/60 text-muted")}>{unread?(dx<=-SWIPE_READ?"놓으면 읽음":"← 밀어서 읽음"):"이미 읽음"}</div>
  <div className="relative" style={{transform:dx?`translateX(${dx}px)`:undefined,transition:dx?"none":"transform 180ms"}}>{children}</div>
 </li>;
}

// 이 화면은 다른 화면으로 가도 숨겨진 채 상태가 남는다(Cache Components의 Activity). 종 버튼 등으로 새로 들어오면
// 이전의 '여는 중' 상태·고른 종류가 남아 다음 알림이 눌리지 않던 문제가 있어, 새로 들어올 때마다 목록을 새로 만든다.
type Props={items:NotificationItem[];userId:string;staff:boolean};
export function NotificationList(props:Props){const {bfcacheId}=useRouter();return <NotificationListBody key={bfcacheId} {...props}/>;}
function NotificationListBody({items:initial,userId,staff}:Props){
 // 화면이 보일 때마다(처음·뒤로 가기로 돌아올 때) 읽음 상태를 서버에서 다시 받는다. 다른 기기나 보고서 화면에서 읽은 것도 바로 반영된다.
 const [items,setItems]=useState(initial);
 useEffect(()=>{let live=true;loadNotifications().then(v=>{if(live)setItems(v);}).catch(()=>{});return ()=>{live=false;};},[]);
 const updates=useAppUpdates(userId,staff);
 const [refreshing,startRefresh]=useTransition();
 const router=useRouter();
 // 알림을 누르면 바로 이동한다. 4초가 지나도 화면이 바뀌지 않으면 주소로 직접 연다(이동이 멈춰 다시 못 누르는 일 방지).
 const [opening,setOpening]=useState<string|null>(null);
 const fallback=useRef<ReturnType<typeof setTimeout>|null>(null);
 // 다른 화면이 열려 이 목록이 숨겨지면 대기 중인 직접 열기를 취소하고 '여는 중' 표시를 지운다.
 useLayoutEffect(()=>()=>{if(fallback.current)clearTimeout(fallback.current);fallback.current=null;setOpening(null);},[]);
 const open=(e:React.MouseEvent<HTMLAnchorElement>,id:string,href:string,fresh:boolean)=>{
  if(fresh)markRead(id);
  if(e.defaultPrevented||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button!==0)return;
  e.preventDefault();setOpening(id);
  if(fallback.current)clearTimeout(fallback.current);
  fallback.current=setTimeout(()=>{if(location.pathname==="/notifications")location.assign(href);},4000);
  router.push(href);
 };
 // 이 화면에서 읽은 알림. 서버 목록을 다시 받기 전에도 바로 읽음으로 보인다.
 const [readHere,setReadHere]=useState<Set<string>>(()=>new Set());
 const isRead=(i:NotificationItem)=>Boolean(i.read_at)||readHere.has(i.id);
 const markRead=(id:string)=>{setReadHere(prev=>new Set(prev).add(id));void markNotificationRead(id);};
 // 상단 종류별 모아보기: 알림이 있는 종류만 버튼으로 보이고, 괄호 안은 안 읽은 수다.
 const [filter,setFilter]=useState<NotificationCategory|"all"|"unread">("all");
 const counted=useMemo(()=>{const map=new Map<NotificationCategory,{total:number;unread:number}>();for(const item of items){const c=notificationCategory(item);const v=map.get(c)??{total:0,unread:0};v.total++;if(!item.read_at&&!readHere.has(item.id))v.unread++;map.set(c,v);}return map;},[items,readHere]);
 const unread=items.filter(i=>!isRead(i)).length;
 const shown=filter==="all"?items:filter==="unread"?items.filter(i=>!isRead(i)):items.filter(i=>notificationCategory(i)===filter);
 const chip=(key:typeof filter,label:string,total:number,fresh:number)=><button key={key} type="button" aria-pressed={filter===key} onClick={()=>setFilter(key)} className={`inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full border px-3 text-sm font-medium transition ${filter===key?"border-accent bg-accent text-accent-foreground":"border-border bg-surface text-foreground hover:border-accent/40"}`}>{label}<span className={filter===key?"text-accent-foreground/80":"text-muted"}>{total}</span>{fresh?<span className={`rounded-full px-1.5 text-xs font-semibold ${filter===key?"bg-accent-foreground/20 text-accent-foreground":"bg-accent/10 text-accent"}`}>새 {fresh}</span>:null}</button>;
 return <><div className="mb-4 flex flex-wrap items-center gap-2"><button type="button" disabled={refreshing} aria-busy={refreshing} onClick={()=>startRefresh(async()=>{try{const v=await loadNotifications();startRefresh(()=>setItems(v));}catch{router.refresh();}})} className={smallButtonClass}>{refreshing?"새로고침 중…":"새로고침"}</button>{unread?<span className="text-xs text-muted">휴대폰에서는 알림을 왼쪽으로 밀면 읽음 처리됩니다.</span>:null}</div><AppUpdateList userId={userId} staff={staff}/>{items.length?<nav aria-label="알림 종류별 모아보기" className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">{chip("all","전체",items.length,unread)}{unread?chip("unread","안 읽음",unread,0):null}{NOTIFICATION_CATEGORIES.filter(([key])=>counted.has(key)).map(([key,label])=>chip(key,label,counted.get(key)!.total,counted.get(key)!.unread))}</nav>:null}{!items.length&&!updates.items.length?<p className="text-sm text-muted">아직 받은 알림이 없습니다.</p>:!items.length?null:!shown.length?<p className="text-sm text-muted">이 종류의 알림이 없습니다.</p>:<ul className="space-y-3">{shown.map(item=>{const href=item.url.startsWith("/")&&!item.url.startsWith("//")?item.url:"/";const fresh=!isRead(item);return <SwipeRow key={item.id} unread={fresh} onRead={()=>markRead(item.id)}>
  {/* 누르면 바로 이동하고, 읽음 처리는 따로 보낸다(기다리지 않아서 다른 알림도 바로 누를 수 있다). */}
  <a href={href} className="block rounded-2xl border border-border bg-surface p-4 transition hover:border-accent/40 focus-visible:outline-2 focus-visible:outline-accent active:bg-accent/5 sm:p-5" aria-busy={opening===item.id} onClick={e=>open(e,item.id,href,fresh)}><div className="flex flex-wrap items-center gap-2"><h2 className="min-w-0 break-words font-semibold">{item.title}</h2>{fresh?<span className="shrink-0 rounded-full bg-accent/10 px-2 py-1 text-xs font-semibold text-accent">새 알림</span>:null}</div>{item.context?<p className="mt-2 inline-flex max-w-full rounded-lg bg-accent/10 px-2 py-1 text-xs font-semibold text-accent">{item.context}</p>:null}<p className="my-3 whitespace-pre-wrap break-words text-sm">{item.body}</p><p className="text-xs text-muted">{new Date(item.created_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul",month:"long",day:"numeric",hour:"numeric",minute:"2-digit"})}</p>{opening===item.id?<p role="status" className="mt-2 text-xs font-semibold text-accent">여는 중…</p>:null}</a>
 </SwipeRow>;})}</ul>}</>;
}
