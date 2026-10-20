import { Suspense } from "react";
import Link from "next/link";
import { requireActive } from "@/lib/auth";
import { BackLink, Badge, Card, ErrorText, Loading, PageTitle, buttonClass } from "@/components/ui";
import { INCIDENT_STATUS, type Incident } from "@/lib/incidents";

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
  return <><BackLink href="/">홈</BackLink><PageTitle sub="예배 중 있었던 일을 함께 확인하고 개선해요.">예배 이슈</PageTitle>
    <Link href={`/incidents/new${typeof report==="string" && /^[0-9a-f-]{36}$/i.test(report) ? `?report=${report}` : ""}`} className={`${buttonClass} mb-5`}>새 이슈 등록</Link>
    <nav aria-label="이슈 상태" className="mb-4 flex flex-wrap gap-2">{[["all","전체"],...Object.entries(INCIDENT_STATUS)].map(([v,l])=><Link key={v} aria-current={filter===v ? "page" : undefined} href={`/incidents?status=${v}${typeof report==="string" && /^[0-9a-f-]{36}$/i.test(report) ? `&report=${report}` : ""}`} className={`rounded-full border border-border px-3 py-2 text-sm ${filter===v ? "bg-accent text-accent-foreground" : "bg-surface text-muted"}`}>{l}</Link>)}</nav>
    {error ? <ErrorText>목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</ErrorText> : <div className="flex flex-col gap-3">{incidents.map(i=><Card key={i.id}><Link href={`/incidents/${i.id}`} className="block"><div className="mb-2 flex items-start justify-between gap-2"><h2 className="font-semibold">{i.title}</h2><Badge tone={i.status==="resolved" ? "muted" : "accent"}>{INCIDENT_STATUS[i.status]}</Badge></div><p className="text-sm text-muted">{i.occurred_on} · {i.service_name}</p><p className="mt-2 text-xs text-muted">담당: {i.follow_up_owner || "미정"}{i.due_on ? ` · 목표일 ${i.due_on}` : ""}</p></Link></Card>)}{!incidents.length ? <Card><p className="text-sm text-muted">표시할 이슈가 없습니다.</p></Card> : <p className="text-xs text-muted">최근 100건까지 표시합니다.</p>}</div>}
  </>;
}
