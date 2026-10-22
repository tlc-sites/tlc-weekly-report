import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import {IncidentForm} from "../incident-form";
import {todayKST} from "@/lib/week";
import { requireActive, isSenior } from "@/lib/auth";
import { listGroupsOrdered } from "@/lib/groups";
import { BackLink, Loading, PageTitle } from "@/components/ui";

export default function NewIncidentPage({searchParams}:PageProps<"/incidents/new">) {
  return <Suspense fallback={<Loading/>}><Content searchParams={searchParams}/></Suspense>;
}
async function Content({searchParams}:Pick<PageProps<"/incidents/new">,"searchParams">) {
  const {supabase,profile}=await requireActive();
  const {report}=await searchParams;
  const groups=await listGroupsOrdered(supabase);
  const {data:memberships}=await supabase.from("memberships").select("group_id").eq("user_id",profile.id);
  const memberGroups=new Set((memberships ?? []).map(m=>m.group_id));
  const available=groups.filter(g=>g.type==="worship" && g.childCount===0 && (isSenior(profile) || memberGroups.has(g.id) || memberGroups.has(g.parent_id)));
  if(report!==undefined) {
    if(typeof report!=="string" || !/^[0-9a-f-]{36}$/i.test(report)) notFound();
    const {data:r}=await supabase.from("reports").select("id,group_id,meeting_date,service_id:service_type_id,meeting_label").eq("id",report).maybeSingle();
    if(!r || !groups.some(g=>g.id===r.group_id && g.type==="worship")) notFound();
    redirect(`/reports/${r.id}#team-issues`);
  }
  const {data:services,error}=await supabase.from("service_types").select("id,name").eq("is_active",true).order("sort_order");
  if(error)throw error;
  return <><BackLink href="/incidents">팀 이슈 모아보기</BackLink><PageTitle sub="예배·모임 이슈 또는 예배와 관계없는 기타 보고를 등록할 수 있습니다.">팀 이슈 보고</PageTitle>{available.length?<IncidentForm groups={available} services={services??[]} today={todayKST()} simple/>:<p className="text-sm text-muted">작성할 팀이 없습니다. 관리자에게 담당 파트 배정을 요청해 주세요.</p>}</>;
}
