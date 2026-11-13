"use client";
import {ThemeSwitch,SIDE_KEY} from "./theme-switch";
import Link from "@/components/pending-link";
import {usePathname} from "next/navigation";
import {useSyncExternalStore,type ReactNode} from "react";
import {QuickSwitcher} from "./quick-switcher";

export type WeekState = "done" | "draft" | "todo" | "none";
export type SidebarSection = { key: string; label: string; groups: { id: string; label: string; state: WeekState; direct: boolean }[] };
const STATE_LABEL: Record<WeekState, string> = { done: "이번 주 제출함", draft: "작성 중", todo: "작성 전", none: "이번 주 모임 없음" };

const icon = (d: ReactNode) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const I = {
 home: icon(<><path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/></>),
 list: icon(<><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></>),
 notice: icon(<><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/></>),
 flag: icon(<><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></>),
 people: icon(<><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-3-5.2"/></>),
 summary: icon(<><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></>),
 meeting: icon(<><rect x="7" y="3" width="14" height="16" rx="2"/><path d="M3 7v12a2 2 0 0 0 2 2h12M11 7h6M11 11h6"/></>),
 pray: icon(<><path d="M12 3v6M9 6h6"/><path d="M5 21h14l-2-9H7z"/></>),
 lock: icon(<><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></>),
 grid: icon(<><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>),
 check: icon(<><path d="M4 12l5 5L20 6"/></>),
 user: icon(<><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>),
 tree: icon(<><rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/></>),
 calendar: icon(<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></>),
 gear: icon(<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></>),
 book: icon(<><path d="M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/></>),
 agenda: icon(<><path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/></>),
 pen: icon(<><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="m14 11 6-6-2-2-6 6-1 4 3-2Z"/></>),
};

type Item = { href: string; label: string; icon: ReactNode; match?: string };

// 사이드바 접힘 상태: <html data-side>가 기준(그리기 전에 THEME_SCRIPT가 넣음). 이 기기에만 저장된다.
const sideListeners = new Set<() => void>();
function subscribeSide(fn: () => void) { sideListeners.add(fn); return () => { sideListeners.delete(fn); }; }
function setSide(mini: boolean) {
 if (mini) document.documentElement.dataset.side = "mini"; else delete document.documentElement.dataset.side;
 try { if (mini) localStorage.setItem(SIDE_KEY, "mini"); else localStorage.removeItem(SIDE_KEY); } catch {}
 sideListeners.forEach(fn => fn());
}

export function DesktopSidebarNav({agenda=false,clergy,manage,pd=false,sections,name,role}:{agenda?:boolean;clergy:boolean;manage:boolean;pd?:boolean;sections:SidebarSection[];name:string;role:string}){
 const path=usePathname();
 // 접기: 너비는 <html data-side="mini">와 CSS가 정하고(새로고침 전에 head 스크립트가 넣음), 여기서는 접혔을 때 묶음을 펼친 아이콘 줄로 그린다.
 const mini=useSyncExternalStore(subscribeSide,()=>document.documentElement.dataset.side==="mini",()=>false);
 const toggle=()=>setSide(!mini);
 const toggleLabel=mini?"메뉴 펼치기":"메뉴 접기";
 const active=(it:Item)=>{const base=it.match??it.href.split("?")[0];return base==="/"?path==="/":path===base||path.startsWith(base+"/");};
 const main:Item[]=[{href:"/",label:"홈",icon:I.home},{href:"/reports",label:"보고 목록",icon:I.list},{href:"/notices",label:"공지·소통",icon:I.notice},...(agenda?[{href:"/agenda",label:"부서 안건",icon:I.agenda}]:[]),{href:"/incidents",label:"확인·조치 목록",icon:I.flag},{href:"/worship-staff",label:"예배위원",icon:I.people},...(pd?[{href:"/pd-checklist",label:"예배 PD 체크리스트",icon:I.check}]:[]),{href:"/cue-sheet",label:"주일예배 큐시트",icon:I.calendar}];
 const pastoral:Item[]=clergy?[{href:"/weekly-summary",label:"주간 요약",icon:I.summary},{href:"/meeting",label:"교역자 회의 자료",icon:I.meeting},{href:"/missing",label:"미제출 보고",icon:I.list},{href:"/notices?tab=restricted",label:"비공개 메시지",icon:I.lock,match:"/__restricted"}]:[];
 const admin:Item[]=[...(manage||clergy?[{href:"/manage",label:"관리",icon:I.grid}]:[]),...(clergy?[{href:"/team-management",label:"팀 명단",icon:I.people}]:[]),...(manage?[{href:"/admin/submissions",label:"전체 제출현황",icon:I.check},{href:"/admin/users",label:"가입 승인·담당 지정",icon:I.user},{href:"/admin/groups",label:"그룹 관리",icon:I.tree},{href:"/admin/services",label:"예배 목록",icon:I.calendar}]:[])];
 const link=(it:Item)=><Link key={it.href} href={it.href} title={mini?it.label:undefined} aria-current={active(it)?"page":undefined} className="app-sidebar-item">{it.icon}<span>{it.label}</span></Link>;
 // 자주 쓰지 않는 묶음은 접어 두고, 지금 보고 있는 화면이 들어 있으면 펼친다.
 const block=(title:string,items:Item[],open=false)=>!items.length?null:mini?<div className="app-sidebar-block">{items.map(link)}</div>:<div className="app-sidebar-block"><details className="app-sidebar-group" open={open||items.some(active)||undefined}><summary><span className="chev" aria-hidden="true">▾</span><span className="flex-1">{title}</span><span className="app-sidebar-count">{items.length}</span></summary>{items.map(link)}</details></div>;
 const quick=[...main.map(i=>({href:i.href,label:i.label,hint:"메뉴"})),{href:"/write",label:"보고 쓰기",hint:"메뉴"},...sections.flatMap(sec=>sec.groups.map(g=>({href:`/groups/${g.id}`,label:g.label,hint:sec.label}))),...pastoral.map(i=>({href:i.href,label:i.label,hint:"목회"})),...(clergy?[{href:"/prayer-meetings",label:"주중 기도회 보고",hint:"목회"}]:[]),...(clergy||manage?[{href:"/sunday-notice",label:"이번 주 공지",hint:"목회"}]:[]),...admin.map(i=>({href:i.href,label:i.label,hint:"관리"})),{href:"/settings",label:"알림 설정",hint:"메뉴"}];
 return <>
  <button type="button" className="app-sidebar-toggle" onClick={toggle} aria-expanded={!mini} aria-label={toggleLabel} title={toggleLabel}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={mini?"M9 6l6 6-6 6":"M15 6l-6 6 6 6"}/></svg></button>
  <QuickSwitcher items={quick}/>
  <Link href="/write" title={mini?"보고 쓰기":undefined} className="app-sidebar-write">{I.pen}<span>보고 쓰기</span></Link>
  {clergy?<Link href="/prayer-meetings" title={mini?"주중 기도회 보고":undefined} aria-current={path.startsWith("/prayer-meetings")?"page":undefined} className="app-sidebar-write is-prayer">{I.pray}<span>주중 기도회 보고</span></Link>:null}
  {clergy||manage?<Link href="/sunday-notice" title={mini?"이번 주 공지":undefined} aria-current={path.startsWith("/sunday-notice")?"page":undefined} className="app-sidebar-write is-prayer">{I.notice}<span>이번 주 공지</span></Link>:null}
  <nav className="app-sidebar-scroll" aria-label="주요 메뉴">
   <div className="app-sidebar-block">{main.map(link)}</div>
   {sections.length&&!mini?<div className="app-sidebar-block">
    <p className="app-sidebar-title">내 파트 <span>· 이번 주</span></p>
    {sections.map(s=>{const done=s.groups.filter(g=>g.state==="done"||g.state==="none").length;return <details key={s.key} className="app-sidebar-group" open>
     <summary><span className="chev" aria-hidden="true">▾</span><span className="flex-1">{s.label}</span><span className="app-sidebar-count" title="이번 주 보고했거나 모임 없음으로 표시한 파트">{done}/{s.groups.length}</span></summary>
     {s.groups.map(g=>{const on=path===`/groups/${g.id}`||path.startsWith(`/groups/${g.id}/`);return <Link key={g.id} href={`/groups/${g.id}`} aria-current={on?"page":undefined} className={"app-sidebar-item app-sidebar-part"+(g.direct?" is-mine":"")} title={`${g.label} · ${STATE_LABEL[g.state]}`}><span className={"app-sidebar-dot is-"+g.state} aria-hidden="true"/><span>{g.label}</span><span className="sr-only">, {STATE_LABEL[g.state]}</span></Link>;})}
    </details>;})}
    <p className="app-sidebar-legend"><span><i className="app-sidebar-dot is-done"/>제출함</span><span><i className="app-sidebar-dot is-draft"/>작성 중</span><span><i className="app-sidebar-dot is-todo"/>작성 전</span></p>
   </div>:null}
   {block("목회",pastoral,true)}
   {block("관리",admin)}
  </nav>
  <div className="app-sidebar-foot">
   <ThemeSwitch className="mb-2 w-full [&>button]:flex-1"/>
   <div className="app-sidebar-me">{mini?<button type="button" className="app-sidebar-avatar" onClick={toggle} title={name+" · 메뉴 펼치기"} aria-label="메뉴 펼치기">{name.slice(0,1)}</button>:<span className="app-sidebar-avatar" aria-hidden="true">{name.slice(0,1)}</span>}<span className="min-w-0 flex-1"><b>{name}</b><small>{role}</small></span></div>
   <div className="app-sidebar-links">
    <Link href="/settings" title={mini?"알림 설정":undefined} aria-current={path==="/settings"?"page":undefined} className="app-sidebar-mini">{I.gear}<span>알림 설정</span></Link>
    <a href="/guide.html" title={mini?"사용 안내":undefined} className="app-sidebar-mini">{I.book}<span>사용 안내</span></a>
    <form action="/auth/signout" method="post" className="ml-auto"><button type="submit" className="app-sidebar-mini">로그아웃</button></form>
   </div>
  </div>
 </>;
}
