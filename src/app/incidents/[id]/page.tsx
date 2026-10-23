import {groupDisplayName} from "@/lib/group-display";
import { IncidentSharing } from "@/components/incident-sharing";
import { IncidentFeedback } from "@/components/incident-feedback";
import { Suspense } from "react";
import Link from "@/components/pending-link";
import { notFound } from "next/navigation";
import { requireActive } from "@/lib/auth";
import { INCIDENT_STATUS, type Incident } from "@/lib/incidents";
import { todayKST } from "@/lib/week";
import { BackLink, Badge, Card, Loading, PageTitle } from "@/components/ui";
import { IncidentForm } from "../incident-form";

export default function IncidentPage({params,searchParams}:PageProps<"/incidents/[id]">) {
  return <Suspense fallback={<Loading/>}><Content params={params} searchParams={searchParams}/></Suspense>;
}
async function Content({params,searchParams}:PageProps<"/incidents/[id]">) {
  const {supabase}=await requireActive();
  const [{id},{saved}]=await Promise.all([params,searchParams]);
  if(!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const {data}=await supabase.from("worship_incidents").select("*").eq("id",id).maybeSingle<Incident>();
  if(!data) notFound();
  const {data:canEdit}=await supabase.rpc("can_edit_incident",{owner_id:data.author_id,related:data.group_ids});
  const {data:groups}=await supabase.from("groups").select("id,name").in("id",data.group_ids);
  return <><BackLink href="/incidents">팀 이슈 모아보기</BackLink><PageTitle sub={`${data.occurred_on} · ${data.service_name}`}>{data.title}</PageTitle>
    {saved ? <p role="status" className="mb-4 rounded-xl bg-accent/10 p-3 text-sm text-accent">저장했습니다.</p> : null}
    <Card className="mb-5"><div className="mb-3"><Badge tone={data.status==="resolved" ? "muted" : "accent"}>{INCIDENT_STATUS[data.status]}</Badge></div><p className="text-sm text-muted">관련 파트: {groups?.map(g=>groupDisplayName(g.name)).join(", ")}</p>
      <dl className="mt-4 flex flex-col gap-4 text-sm">{[["담당 교역자",data.pastor||"미정"],["당시 참여 인원",data.participants||"미입력"],["발생 경위",data.circumstances],["발생 원인",data.cause||"확인 중"],["대응과 결과",data.response||"확인 중"],["향후 개선대책",data.prevention||"작성 예정"],["후속 조치 담당자",data.follow_up_owner||"미정"],["조치 목표일",data.due_on||"미정"]].map(([label,value])=><div key={label}><dt className="mb-1 font-semibold">{label}</dt><dd className="whitespace-pre-wrap">{value}</dd></div>)}</dl>
      {data.report_id ? <Link href={`/reports/${data.report_id}`} className="mt-4 inline-block text-sm text-accent underline">연결된 주간 보고 보기</Link> : null}
    </Card>
    {canEdit ? <details><summary className="mb-4 cursor-pointer font-semibold text-accent">내용 보완·후속 조치 업데이트</summary><Card><IncidentForm incident={data} today={todayKST()}/></Card></details> : null}
    <IncidentSharing incidentId={id}/><IncidentFeedback incidentId={id}/>
  </>;
}
