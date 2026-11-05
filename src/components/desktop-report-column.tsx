"use client";
import Link from "@/components/pending-link";
import {usePathname} from "next/navigation";
import {useEffect,useState} from "react";
import {loadReportColumn,type ReportColumn,type ColumnReport} from "./report-column-actions";
import {DesktopNotificationColumn} from "./desktop-notification-column";
import {useNotificationPanel} from "./notification-panel-store";

const STATUS: Record<ColumnReport["status"], [string, string]> = { draft: ["임시저장", "is-draft"], submitted: ["확인 대기", "is-sub"], reviewed: ["확인됨", "is-rev"] };
const RESULT: Record<string, [string, string]> = { minor: ["경미한 문제", "is-minor"], incident: ["사고", "is-incident"], other: ["기타", ""] };
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
type Filter = "all" | "wait" | "draft" | "issue";
const FILTERS: [Filter, string, (r: ColumnReport) => boolean][] = [
 ["all", "전체", () => true],
 ["wait", "확인 대기", r => r.status === "submitted"],
 ["draft", "임시저장", r => r.status === "draft"],
 ["issue", "이슈", r => r.result === "minor" || r.result === "incident" || r.attention],
];
// 보고 날짜가 속한 주(일요일 시작)
const sundayOf = (iso: string) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.toISOString().slice(0, 10); };
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const addWeek = (iso: string, n: number) => addDays(iso, n * 7);
const todayKST = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

// PC 가운데 열: 사이드바 종으로 알림 목록을 열었으면 알림을, 아니면 파트·보고 화면에서 그 파트의 보고 목록을 보여 준다.
export function DesktopReportColumn(){
 return useNotificationPanel()?<DesktopNotificationColumn/>:<ReportListColumn/>;
}

// 파트 화면·보고 화면에서 그 파트의 보고 목록을 옆에 띄워, 페이지를 오가지 않고 다음 보고로 넘어갈 수 있게 한다.
function ReportListColumn(){
 const path=usePathname();
 const group=path.match(new RegExp(`^/groups/(${UUID})`))?.[1];
 const report=path.match(new RegExp(`^/reports/(${UUID})`))?.[1];
 const [loaded,setLoaded]=useState<{key:string;data:ReportColumn|null}|null>(null);
 const [failed,setFailed]=useState(false);
 const [filter,setFilter]=useState<Filter>("all");
 // 보는 주: 고르지 않았으면 열린 보고의 주, 없으면 이번 주. null이면 모든 주를 이어서 보여 준다.
 const [pickedWeek,setPickedWeek]=useState<{key:string;week:string|null}|null>(null);
 useEffect(()=>{
  if(!group&&!report)return;
  let live=true;
  const key=group??report!;
  loadReportColumn({groupId:group,reportId:report}).then(d=>{if(live){setLoaded({key,data:d});setFailed(false);}}).catch(()=>{if(live)setFailed(true);});
  return ()=>{live=false;};
 },[group,report]);
 // 같은 파트 안에서 보고를 옮겨 다닐 때는 목록을 유지해 깜빡이지 않게 한다.
 const data=loaded?.data??null;
 const current=loaded?.key===(group??report)||(data&&(group?data.groupId===group:data.reports.some(r=>r.id===report)))?data:null;
 if(!group&&!report)return null;
 const thisWeek=sundayOf(todayKST());
 const openWeek=report?current?.reports.find(r=>r.id===report)?.date:undefined;
 const week=pickedWeek?.key===(current?.groupId??"")?pickedWeek.week:(openWeek?sundayOf(openWeek):thisWeek);
 const setWeek=(w:string|null)=>setPickedWeek({key:current?.groupId??"",week:w});
 const inWeek=(current?.reports??[]).filter(r=>week===null||sundayOf(r.date)===week);
 const rows=inWeek.filter(FILTERS.find(f=>f[0]===filter)![2]);
 const weeks=new Map<string,ColumnReport[]>();for(const r of rows){const w=sundayOf(r.date);weeks.set(w,[...(weeks.get(w)??[]),r]);}
 return <aside data-print-hide className="app-listcol" aria-label="보고 목록">
  <div className="app-listcol-head">
   <Link href={current?`/groups/${current.groupId}`:"#"} className="min-w-0 flex-1"><b># {current?.groupName??"불러오는 중…"}</b><small>{current?`보고 ${current.reports.length}건`:" "}</small></Link>
   {current?<Link href={`/groups/${current.groupId}#new-report`} className="app-listcol-new">+ 보고</Link>:null}
  </div>
  <div className="app-listcol-weeknav">
   <button type="button" onClick={()=>setWeek(addWeek(week??thisWeek,-1))} aria-label="지난주">‹ 지난주</button>
   <button type="button" className="app-listcol-weeklabel" onClick={()=>setWeek(week===null?thisWeek:null)} title={week===null?"이번 주만 보기":"모든 주 보기"}>{week===null?"모든 주":`${md(week)} ~ ${md(addDays(week,6))}`}{week===thisWeek?" · 이번 주":""}</button>
   <button type="button" onClick={()=>setWeek(addWeek(week??thisWeek,1))} disabled={week!==null&&week>=thisWeek} aria-label="다음 주">다음 주 ›</button>
  </div>
  <div className="app-listcol-tabs" role="tablist" aria-label="보고 거르기">{FILTERS.map(([k,label,fn])=><button key={k} type="button" role="tab" aria-selected={filter===k} className={filter===k?"is-on":""} onClick={()=>setFilter(k)}>{label}{current?<span>{inWeek.filter(fn).length}</span>:null}</button>)}</div>
  <div className="app-listcol-rows">
   {failed?<p className="app-listcol-empty">보고 목록을 불러오지 못했습니다. 새로고침해 주세요.</p>:!current?<p className="app-listcol-empty">불러오는 중…</p>:!rows.length?<p className="app-listcol-empty">{filter!=="all"?"조건에 맞는 보고가 없습니다.":week===null?"아직 보고가 없습니다.":"이 주에는 보고가 없습니다."}</p>:
    [...weeks].map(([w,list])=><section key={w}>
     <p className="app-listcol-week">{md(w)} 주</p>
     {list.map(r=>{const [sl,sc]=STATUS[r.status],res=r.result?RESULT[r.result]:undefined,on=report===r.id;return <Link key={r.id} href={`/reports/${r.id}`} aria-current={on?"page":undefined} className="app-listcol-row">
      <span className="app-listcol-date"><b>{md(r.date)}</b>{WEEKDAY[new Date(r.date+"T00:00:00Z").getUTCDay()]}</span>
      <span className="min-w-0 flex-1"><span className="app-listcol-title">{r.title}</span><span className="app-listcol-meta">{r.author}</span>
       <span className="app-listcol-pills"><span className={"app-pill "+sc}>{sl}</span>{res?<span className={"app-pill "+res[1]}>{res[0]}</span>:null}{r.attention&&r.result!=="minor"&&r.result!=="incident"?<span className="app-pill is-minor">확인·조치</span>:null}</span></span>
     </Link>;})}
    </section>)}
  </div>
 </aside>;
}
