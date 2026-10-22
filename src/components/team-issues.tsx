import { createClient } from "@/lib/supabase/server";
import Link from "@/components/pending-link";
import { IncidentFeedback } from "./incident-feedback";
import { Card, Badge, ErrorText } from "./ui";
import { IncidentForm } from "@/app/incidents/incident-form";
import { INCIDENT_STATUS, type Incident } from "@/lib/incidents";

export async function TeamIssues({items,groups,context,today,error,canWrite}:{
  canWrite:boolean;
  items:Incident[]; groups:{id:string;name:string}[]; today:string; error:boolean;
  context:{report_id:string;group_id:string;occurred_on:string;service_id:string;service_name:string};
}) {
  const supabase=await createClient();
  const rights=await Promise.all(items.map(i=>supabase.rpc("can_edit_incident",{owner_id:i.author_id,related:i.group_ids}).then(r=>[i.id,Boolean(r.data)] as const)));
  const editable=new Map(rights);
  const returnTo=`/reports/${context.report_id}`;
  return <Card className="mb-5"><section id="team-issues" className="scroll-mt-5">
    <h2 className="font-semibold">팀 이슈</h2>
    <p className="mb-4 mt-1 text-sm text-muted">간단한 이슈부터 기록해 주세요. 상세 경위도 같은 이슈에 덧붙입니다. 관련 팀이 같은 예배를 보고할 때 함께 표시됩니다.</p>
    {error ? <ErrorText>팀 이슈를 불러오지 못했습니다.</ErrorText> : <div className="mb-4 flex flex-col gap-3">{items.map(i=><article key={i.id} className="rounded-xl border border-border p-4">
      <div className="flex items-start justify-between gap-2"><h3 className="font-semibold">{i.title}</h3><Badge tone={i.status==="resolved" ? "muted" : "accent"}>{INCIDENT_STATUS[i.status]}</Badge></div>
      <p className="mt-1 text-xs text-muted">{i.category} · {groups.filter(g=>i.group_ids.includes(g.id)).map(g=>g.name).join(", ")}{i.detailed ? " · 상세 경위 포함" : ""}</p>
      <p className="mt-3 whitespace-pre-wrap text-sm">{i.circumstances}</p>
      {i.response ? <p className="mt-2 whitespace-pre-wrap text-sm text-muted">조치: {i.response}</p> : null}
      {editable.get(i.id) ? <details className="mt-3"><summary className="cursor-pointer text-sm font-medium text-accent">내용 수정·상세 경위 추가</summary><div className="mt-4"><IncidentForm key={i.updated_at} incident={i} today={today} returnTo={returnTo}/></div></details> : null}
      <Link href={`/incidents/${i.id}`} className="mt-3 inline-block text-sm text-accent underline">이슈 상세 보기</Link>
      <IncidentFeedback incidentId={i.id}/>
    </article>)}{!items.length ? <p className="text-sm text-muted">등록된 팀 이슈가 없습니다.</p> : null}</div>}
    {canWrite ? <details><summary className="cursor-pointer rounded-xl bg-accent/8 px-4 py-3 text-sm font-semibold text-accent">+ 팀 이슈 추가</summary><div className="mt-4"><IncidentForm simple initial={context} groups={groups} today={today} returnTo={returnTo}/></div></details> : null}
    <p className="mt-4 text-xs text-muted">이슈는 보고 저장과 별도로 저장되며, 보고를 다시 저장해도 처리 상태가 유지됩니다.</p>
  </section></Card>;
}
