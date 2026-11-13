import Link from "./pending-link";
import {Card,StatusChip} from "./ui";
import {AutoTranslation} from "./auto-translation";
import {reportSummaryLines,type SummaryReport,type SummaryIncident} from "@/lib/weekly-summary";
import {isUnread,type PriorityItem,type PriorityTier} from "@/lib/senior-priority";
import {formatDate} from "@/lib/week";

// 보고 하나: 팀·작성자·상태 표시와 본문 앞 3줄만. 원문과 코멘트는 「전체 보기」로 연다.
function ReportItem({r,team,senior,unread,hasMessage}:{r:SummaryReport;team:string;senior:boolean;unread:boolean;hasMessage:boolean}){
 const d=r.details;
 const lines=reportSummaryLines(r).filter(l=>l!=="경미한 이슈"&&l!=="예배 사고").map(l=>l.startsWith("사역 내용·특이사항: ")?l.slice("사역 내용·특이사항: ".length):l);
 return <article className="border-b border-border py-4 last:border-0">
  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><h3 className="font-semibold">{team}</h3><span className="text-muted">{[r.author_name,r.service?.name??r.meeting_label,formatDate(r.meeting_date)].filter(Boolean).join(" · ")}</span></div>
  <div className="mt-2 flex flex-wrap gap-1">
   {d.result==="incident"?<span className="st bg-danger/10 text-danger">예배 사고</span>:d.result==="minor"?<StatusChip tone="draft">경미한 이슈</StatusChip>:null}
   {d.needs_attention===true?(d.attention_status==="resolved"?<StatusChip tone="done">조치 완료</StatusChip>:<span className="st bg-danger/10 text-danger">{d.attention_status==="temporary"?"조치 중":"확인·조치 필요"}</span>):null}
   {hasMessage?<StatusChip tone="wait">드리는 글 있음</StatusChip>:null}
   {senior&&unread?<StatusChip tone="todo">안 읽음</StatusChip>:null}
  </div>
  {senior?<AutoTranslation kind="report" id={r.id} source={reportSummaryLines(r).join("\n")} senior/>:null}
  <div className="mt-2 line-clamp-3 whitespace-pre-line break-words">{lines.join("\n")||"작성된 내용이 없습니다."}</div>
  <Link href={"/reports/"+r.id} className="mt-1 inline-flex min-h-11 items-center gap-1 font-semibold text-accent">전체 보기 <span aria-hidden>›</span></Link>
 </article>;
}

function IncidentItem({i,names}:{i:SummaryIncident;names:Map<string,string>}){
 return <article className="border-b border-border py-4 last:border-0">
  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><h3 className="font-semibold">{i.group_ids.map(id=>names.get(id)??"팀").join(" · ")} · {i.title}</h3><span className="text-muted">{[i.service_name,formatDate(i.occurred_on)].join(" · ")}</span></div>
  <div className="mt-2">{i.status==="resolved"?<StatusChip tone="done">예배 이슈 · 해결</StatusChip>:<span className="st bg-danger/10 text-danger">예배 이슈 · 확인 필요</span>}</div>
  <div className="mt-2 line-clamp-3 whitespace-pre-line break-words">{i.circumstances}{i.response?"\n조치: "+i.response:""}</div>
  <Link href={"/incidents/"+i.id} className="mt-1 inline-flex min-h-11 items-center gap-1 font-semibold text-accent">전체 보기 <span aria-hidden>›</span></Link>
 </article>;
}

export function PriorityReportList({tiers,names,senior,messageIds,readVersions,emptyText}:{tiers:{tier:PriorityTier;title:string;items:PriorityItem[]}[];names:Map<string,string>;senior:boolean;messageIds:Set<string>;readVersions:Map<string,string>;emptyText:string}){
 const visible=tiers.filter(t=>t.items.length);
 if(!visible.length)return <p className="text-muted">{emptyText}</p>;
 const body=(items:PriorityItem[])=>items.map(it=>it.kind==="incident"?<IncidentItem key={"i"+it.incident.id} i={it.incident} names={names}/>:<ReportItem key={it.report.id} r={it.report} team={names.get(it.report.group_id)??"팀"} senior={senior} hasMessage={messageIds.has(it.report.id)} unread={isUnread(it.report,readVersions)}/>);
 return <>{visible.map(t=>t.tier==="clear"
  // 이상 없는 보고는 한 줄로 접어 두고 누르면 펼친다
  ?<details key={t.tier} className="mb-6 rounded-2xl border border-border bg-surface px-4"><summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-2 text-xl font-semibold"><span>이상 없음 {t.items.length}건</span><span aria-hidden className="text-accent">›</span></summary><div className="border-t border-border">{body(t.items)}</div></details>
  :<section key={t.tier} className="mb-6" aria-label={t.title}><h2 className="mb-2 text-xl font-semibold">{t.title} <span className="text-muted">{t.items.length}건</span></h2><Card>{body(t.items)}</Card></section>)}</>;
}
