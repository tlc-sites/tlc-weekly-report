import {groupDisplayName,meetingDisplayName} from "@/lib/group-display";
import { Suspense } from "react";
import Link from "@/components/pending-link";
import { requireActive } from "@/lib/auth";
import { BackLink, Badge, Card, ErrorText, Loading, PageTitle, buttonClass } from "@/components/ui";
import { INCIDENT_STATUS, type Incident } from "@/lib/incidents";
import { groupIncidentEvents } from "@/lib/incident-events";
import {HELP} from "@/lib/help-text";

export default function IncidentsPage({searchParams}:PageProps<"/incidents">) {
  return <Suspense fallback={<Loading/>}><Content searchParams={searchParams}/></Suspense>;
}
async function Content({searchParams}:Pick<PageProps<"/incidents">,"searchParams">) {
  const {supabase}=await requireActive();
  const {status,report}=await searchParams;
  const filter=typeof status==="string" && status in INCIDENT_STATUS ? status : "all";
  let query=supabase.from("worship_incidents").select("*").order("occurred_on",{ascending:false}).order("created_at",{ascending:false}).limit(100);
  if(filter!=="all") query=query.eq("status",filter);
  if(typeof report==="string" && /^[0-9a-f-]{36}$/i.test(report)) query=query.eq("report_id",report);
  const {data,error}=await query;
  const incidents=(data ?? []) as Incident[];
  let markedQuery=supabase.from("reports").select("id,meeting_date,meeting_label,author_name,duty_part,details,group:groups(name),service:service_types(name),meeting:group_meeting_types(name)").neq("status","draft").contains("details",{needs_attention:true}).order("meeting_date",{ascending:false}).limit(100);
  if(typeof report==="string"&&/^[0-9a-f-]{36}$/i.test(report))markedQuery=markedQuery.eq("id",report);
  const marked=await markedQuery;
  const markedRows=(marked.data??[]).filter(r=>filter==="all"||(r.details.attention_status??"open")===filter);
  return <><BackLink href="/">홈</BackLink><PageTitle info={HELP.issues} sub="사역 보고에서 확인·조치가 필요하다고 표시한 내용을 모아봅니다. 원문과 코멘트는 같은 보고서에 연결됩니다.">확인·조치 목록</PageTitle>
    <Link href="/incidents/new" className={`${buttonClass} mb-5`}>사역 보고 작성</Link>
    <nav aria-label="이슈 상태" className="mb-4 flex flex-wrap gap-2">{[["all","전체"],...Object.entries(INCIDENT_STATUS)].map(([v,l])=><Link key={v} aria-current={filter===v ? "page" : undefined} href={`/incidents?status=${v}${typeof report==="string" && /^[0-9a-f-]{36}$/i.test(report) ? `&report=${report}` : ""}`} className={`rounded-full border border-border px-3 py-2 text-sm ${filter===v ? "bg-accent text-accent-foreground" : "bg-surface text-muted"}`}>{l}</Link>)}</nav>
    {marked.error?<ErrorText>사역 보고를 불러오지 못했습니다.</ErrorText>:<div className="mb-5 flex flex-col gap-3">{markedRows.map(r=><Card key={r.id}><Link href={"/reports/"+r.id}><div className="flex flex-wrap items-center gap-2"><strong>{groupDisplayName((r.group as unknown as {name:string}|null)?.name??"팀")} · {meetingName(r)}</strong><span className="text-sm text-muted">{r.author_name}</span><Badge>{r.details.attention_status==="resolved"?"해결":r.details.attention_status==="temporary"?"조치 중":"확인 필요"}</Badge></div><p className="mt-2 text-xs text-muted">{[r.meeting_date,meetingName(r)==="사역 보고"?"":meetingName(r),r.duty_part].filter(Boolean).join(" · ")}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm">{String(r.details.notes??"")}</p><p className="mt-2 text-xs text-accent underline">보고서 · 코멘트 보기</p></Link></Card>)}{!markedRows.length?<p className="text-sm text-muted">표시할 사역 보고가 없습니다.</p>:null}</div>}
    {error ? <ErrorText>목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</ErrorText> : <div className="flex flex-col gap-5">{groupIncidentEvents(incidents).map(event=><section key={event.key}><h2 className="mb-2 rounded-xl bg-accent/10 px-4 py-3 font-semibold text-accent">{event.date} · {event.name} <span className="text-sm">({event.items.length}건)</span></h2><div className="flex flex-col gap-3">{event.items.map(i=><Card key={i.id}><Link href={`/incidents/${i.id}`} className="block"><div className="mb-2 flex items-start justify-between gap-2"><h3 className="font-semibold">{i.title}</h3><Badge tone={i.status==="resolved" ? "muted" : "accent"}>{INCIDENT_STATUS[i.status]}</Badge></div><p className="whitespace-pre-wrap text-sm">{i.circumstances}</p><p className="mt-2 text-xs text-muted">후속 담당: {i.follow_up_owner || "미정"}{i.due_on ? ` · 목표일 ${i.due_on}` : ""}</p></Link></Card>)}</div></section>)}{!incidents.length ? <Card><p className="text-sm text-muted">표시할 이슈가 없습니다.</p></Card> : <p className="text-xs text-muted">최근 100건까지 표시합니다.</p>}</div>}
  </>;
}

// 보고에 연결된 예배·모임 이름. 직접 입력한 행사명이 있으면 그것을 쓴다.
function meetingName(r:{meeting_label:string|null;service:unknown;meeting:unknown}){
  const name=(v:unknown)=>(v as {name:string}|null)?.name;
  const found=name(r.service)??name(r.meeting)??r.meeting_label;
  return found?meetingDisplayName(found):"사역 보고";
}
