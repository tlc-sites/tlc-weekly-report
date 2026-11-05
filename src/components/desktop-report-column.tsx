"use client";
import Link from "@/components/pending-link";
import {usePathname} from "next/navigation";
import {useEffect,useState} from "react";
import {loadReportColumn,type ReportColumn,type ColumnReport} from "./report-column-actions";

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
const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

// PC 가운데 열: 파트 화면·보고 화면에서 그 파트의 보고 목록을 옆에 띄워, 페이지를 오가지 않고 다음 보고로 넘어갈 수 있게 한다.
export function DesktopReportColumn(){
 const path=usePathname();
 const group=path.match(new RegExp(`^/groups/(${UUID})`))?.[1];
 const report=path.match(new RegExp(`^/reports/(${UUID})`))?.[1];
 const [loaded,setLoaded]=useState<{key:string;data:ReportColumn|null}|null>(null);
 const [failed,setFailed]=useState(false);
 const [filter,setFilter]=useState<Filter>("all");
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
 const rows=(current?.reports??[]).filter(FILTERS.find(f=>f[0]===filter)![2]);
 const weeks=new Map<string,ColumnReport[]>();for(const r of rows){const w=sundayOf(r.date);weeks.set(w,[...(weeks.get(w)??[]),r]);}
 return <aside data-print-hide className="app-listcol" aria-label="보고 목록">
  <div className="app-listcol-head">
   <Link href={current?`/groups/${current.groupId}`:"#"} className="min-w-0 flex-1"><b># {current?.groupName??"불러오는 중…"}</b><small>{current?`보고 ${current.reports.length}건`:" "}</small></Link>
   {current?<Link href={`/groups/${current.groupId}#new-report`} className="app-listcol-new">+ 보고</Link>:null}
  </div>
  <div className="app-listcol-tabs" role="tablist" aria-label="보고 거르기">{FILTERS.map(([k,label,fn])=><button key={k} type="button" role="tab" aria-selected={filter===k} className={filter===k?"is-on":""} onClick={()=>setFilter(k)}>{label}{current?<span>{current.reports.filter(fn).length}</span>:null}</button>)}</div>
  <div className="app-listcol-rows">
   {failed?<p className="app-listcol-empty">보고 목록을 불러오지 못했습니다. 새로고침해 주세요.</p>:!current?<p className="app-listcol-empty">불러오는 중…</p>:!rows.length?<p className="app-listcol-empty">{filter==="all"?"아직 보고가 없습니다.":"조건에 맞는 보고가 없습니다."}</p>:
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
