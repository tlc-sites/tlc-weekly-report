import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "@/components/pending-link";

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
  return <><BackLink href="/incidents">확인·조치 목록</BackLink><PageTitle sub="사역 내용을 한 번만 작성하고 ‘확인·조치 필요’를 표시해 주세요.">사역 보고 작성</PageTitle><ul className="divide-y divide-border">{available.map(g=><li key={g.id}><Link href={`/groups/${g.id}#new-report`} className="block py-4 font-semibold text-accent">{g.label} ›</Link></li>)}</ul>{!available.length?<p>작성할 팀이 없습니다. 담당 파트 배정을 확인해 주세요.</p>:null}</>;

}
