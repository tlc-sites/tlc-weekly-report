"use client";
import {useSyncExternalStore} from "react";
import {APP_UPDATES,guideHref,visibleUpdates} from "@/lib/app-updates";

// 업데이트 공지의 읽음은 이 기기(브라우저)에만 계정별로 저장한다. 저장이 막혀도 공지는 그대로 보인다.
const CHANGED="tlc-report-updates-changed";
const keyFor=(userId:string)=>"tlc-report-read-updates:"+userId;
function readIds(userId:string):string[]{try{const v=JSON.parse(localStorage.getItem(keyFor(userId))||"[]");return Array.isArray(v)?v.filter(x=>typeof x==="string"):[];}catch{return [];}}
export function markUpdatesRead(userId:string,ids:string[]){try{localStorage.setItem(keyFor(userId),JSON.stringify([...new Set([...readIds(userId),...ids])]));}catch{}window.dispatchEvent(new Event(CHANGED));}
function subscribe(onChange:()=>void){window.addEventListener(CHANGED,onChange);window.addEventListener("storage",onChange);window.addEventListener("focus",onChange);const timer=setInterval(onChange,60000);return ()=>{window.removeEventListener(CHANGED,onChange);window.removeEventListener("storage",onChange);window.removeEventListener("focus",onChange);clearInterval(timer);};}

/** 보이는 업데이트와 읽음 여부. 스냅샷을 문자열로 만들어 값이 같으면 다시 그리지 않는다. */
export function useAppUpdates(userId:string,staff:boolean){
 const snapshot=useSyncExternalStore(subscribe,()=>{const read=new Set(readIds(userId));return visibleUpdates(Date.now(),staff).map(u=>u.id+(read.has(u.id)?":r":"")).join(",");},()=>"");
 const states=new Map(snapshot?snapshot.split(",").map(s=>[s.replace(/:r$/,""),s.endsWith(":r")] as const):[]);
 const items=APP_UPDATES.filter(u=>states.has(u.id)).map(u=>({...u,read:states.get(u.id)===true}));
 return {items,unread:items.filter(u=>!u.read).length};
}

export function AppUpdateList({userId,staff}:{userId:string;staff:boolean}){
 const {items}=useAppUpdates(userId,staff);
 if(!items.length)return null;
 return <ul className="mb-3 space-y-3">{items.map(u=><li key={u.id}><a href={guideHref(staff)} onClick={()=>markUpdatesRead(userId,[u.id])} className="block rounded-2xl border border-accent/30 bg-accent/5 p-4 transition hover:border-accent/50 focus-visible:outline-2 focus-visible:outline-accent sm:p-5"><div className="flex flex-wrap items-center gap-2"><h2 className="min-w-0 break-words font-semibold">{u.title}</h2>{!u.read?<span className="shrink-0 rounded-full bg-accent/10 px-2 py-1 text-xs font-semibold text-accent">새 알림</span>:null}</div><p className="my-3 whitespace-pre-wrap break-words text-sm">{u.body}</p><p className="text-xs text-muted">{new Date(u.publishAt).toLocaleDateString("ko-KR",{timeZone:"Asia/Seoul",month:"long",day:"numeric"})} · 사용 안내로 이동</p></a></li>)}</ul>;
}
