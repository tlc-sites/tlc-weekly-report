import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireActive, isSenior } from "@/lib/auth";
import { listGroupsOrdered } from "@/lib/groups";
import { BackLink, Card, Loading, PageTitle } from "@/components/ui";

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
  return <><BackLink href="/incidents">팀 이슈 모아보기</BackLink><PageTitle sub="담당 팀의 보고서를 열고 ‘팀 이슈’에서 작성해 주세요.">팀 선택</PageTitle><Card>{available.length ? <ul className="divide-y divide-border">{available.map(g=><li key={g.id}><Link href={`/groups/${g.id}`} className="flex min-h-12 items-center justify-between py-3 text-accent">{g.name}<span aria-hidden>›</span></Link></li>)}</ul> : <p className="text-sm text-muted">예배·기술팀 소속 담당자와 관리자가 등록할 수 있습니다. 관리자에게 담당 파트 배정을 요청해 주세요.</p>}</Card></>;
}
