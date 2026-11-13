"use client";
import Link from "@/components/pending-link";
import {usePathname} from "next/navigation";
import type {ReactNode} from "react";

const icon=(d:ReactNode)=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-6">{d}</svg>;
const I={
 home:icon(<><path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/></>),
 pen:icon(<><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="m14 11 6-6-2-2-6 6-1 4 3-2Z"/></>),
 list:icon(<><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></>),
 notice:icon(<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/>),
 more:icon(<><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></>),
 summary:icon(<><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></>),
 flag:icon(<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>),
 agenda:icon(<><path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/></>),
};
type Tab={href:string;label:string;icon:ReactNode;match:(p:string)=>boolean};
const under=(...bases:string[])=>(p:string)=>bases.some(b=>p===b||p.startsWith(b+"/"));
const MORE=under("/more","/manage","/admin","/team-management","/settings","/worship-staff","/cue-sheet","/pd-checklist","/meeting","/prayer-meetings","/missing","/sunday-notice","/messages","/notifications");

// 휴대폰 하단 탭 5개. 보고를 쓰는 분: 홈·보고 쓰기·보고 목록·공지·더보기 / 담임 목사님·사모님(읽는 분): 홈·주간 요약·확인·조치·부서 안건·더보기
export function BottomNavigationLinks({senior}:{senior:boolean}){
 const path=usePathname();
 const tabs:Tab[]=senior
  ?[{href:"/",label:"홈",icon:I.home,match:p=>p==="/"},{href:"/weekly-summary",label:"주간 요약",icon:I.summary,match:under("/weekly-summary")},{href:"/incidents",label:"확인·조치",icon:I.flag,match:under("/incidents")},{href:"/agenda",label:"부서 안건",icon:I.agenda,match:under("/agenda")},{href:"/more",label:"더보기",icon:I.more,match:MORE}]
  :[{href:"/",label:"홈",icon:I.home,match:p=>p==="/"},{href:"/write",label:"보고 쓰기",icon:I.pen,match:p=>under("/write","/groups")(p)||/^\/reports\/[^/]+$/.test(p)},{href:"/reports",label:"보고 목록",icon:I.list,match:p=>p==="/reports"},{href:"/notices",label:"공지·소통",icon:I.notice,match:under("/notices","/agenda","/incidents")},{href:"/more",label:"더보기",icon:I.more,match:MORE}];
 return <nav data-print-hide aria-label="하단 메뉴" className="app-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur">
  <ul className="mx-auto grid w-full max-w-2xl grid-cols-5 px-1 pt-1">{tabs.map(t=>{const on=t.match(path);return <li key={t.href}>
   <Link href={t.href} aria-current={on?"page":undefined} className={"flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[14px] leading-tight "+(on?"font-semibold text-accent":"text-muted")}>{t.icon}<span className="whitespace-nowrap">{t.label}</span></Link>
  </li>;})}</ul>
 </nav>;
}
