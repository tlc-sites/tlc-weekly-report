import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireActive } from "@/lib/auth";
import { listGroupsOrdered } from "@/lib/groups";
import { todayKST } from "@/lib/week";
import { BackLink, Card, Loading, PageTitle } from "@/components/ui";
import { IncidentForm } from "../incident-form";

export default function NewIncidentPage({searchParams}:PageProps<"/incidents/new">) {
  return <Suspense fallback={<Loading/>}><Content searchParams={searchParams}/></Suspense>;
}
async function Content({searchParams}:Pick<PageProps<"/incidents/new">,"searchParams">) {
  const {supabase,profile}=await requireActive();
  const {report}=await searchParams;
  const [groups,{data:services}]=await Promise.all([listGroupsOrdered(supabase),supabase.from("service_types").select("id,name").eq("is_active",true).order("sort_order")]);
  const {data:memberships}=await supabase.from("memberships").select("group_id").eq("user_id",profile.id);
  const memberGroups=new Set((memberships ?? []).map(m=>m.group_id));
  const canCreate=profile.is_admin || groups.some(g=>g.type==="worship" && g.childCount===0 && (memberGroups.has(g.id) || memberGroups.has(g.parent_id)));
  let initial;
  if(report!==undefined) {
    if(typeof report!=="string" || !/^[0-9a-f-]{36}$/i.test(report)) notFound();
    const {data:r}=await supabase.from("reports").select("id,group_id,meeting_date,service_id:service_type_id,meeting_label").eq("id",report).maybeSingle();
    if(!r || !groups.some(g=>g.id===r.group_id && g.type==="worship")) notFound();
    initial={report_id:r.id,group_id:r.group_id,occurred_on:r.meeting_date,service_id:r.service_id ?? "",service_name:services?.find(s=>s.id===r.service_id)?.name ?? r.meeting_label ?? "기타 예배"};
  }
  return <><BackLink href={initial ? `/incidents?report=${initial.report_id}` : "/incidents"}>예배 이슈</BackLink><PageTitle sub="확인된 내용부터 기록하고 나중에 보완해 주세요.">예배 이슈 등록</PageTitle><Card>{canCreate ? <IncidentForm groups={groups.filter(g=>g.type==="worship" && g.childCount===0)} services={services ?? []} initial={initial} today={todayKST()}/> : <p className="text-sm text-muted">예배·기술팀 소속 담당자와 관리자가 등록할 수 있습니다. 관리자에게 담당 파트 배정을 요청해 주세요.</p>}</Card></>;
}
