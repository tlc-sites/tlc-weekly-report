import {groupDisplayName} from "@/lib/group-display";
import {WeeklyReportBlock} from "@/components/weekly-report-block";
import {Suspense} from "react";
import Link from "@/components/pending-link";
import {redirect} from "next/navigation";
import {requireActive,isClergy,isSenior} from "@/lib/auth";
import {Loading,Card,PageTitle} from "@/components/ui";
import {loadWeeklySummary} from "@/lib/weekly-summary-data";
import {weeklyBlocks} from "@/lib/weekly-summary";
import {reportWeek,todayKST,addDays,formatWeek} from "@/lib/week";
import {HELP} from "@/lib/help-text";
export default function Page(props:PageProps<"/weekly-summary">){return <Suspense fallback={<Loading/>}><Content {...props}/></Suspense>;}
async function Content({searchParams}:PageProps<"/weekly-summary">){
 const {supabase,profile}=await requireActive();if(!isClergy(profile))redirect("/");
 const query=await searchParams;const week=reportWeek(query.week,todayKST());const data=await loadWeeklySummary(supabase,week);
 const attention=query.attention==="1";const blocks=weeklyBlocks(attention?data.reports.filter(r=>r.details.needs_attention===true&&r.details.attention_status!=="resolved"):data.reports,data.groups,attention?data.incidents.filter(i=>i.status!=="resolved"):data.incidents),names=new Map(data.groups.map(g=>[g.id,groupDisplayName(g.name)]));
 const warnings=data.reports.filter(r=>r.details.result==="minor"||r.details.result==="incident");
 return <><Link href="/" className="mb-4 text-sm text-accent">← 홈</Link><PageTitle info={HELP.summary} sub="예배별 예배·기술팀 → 교회학교별 → 그 외 팀별로 모았습니다. 열람 권한이 있는 내용만 표시합니다.">주간 요약</PageTitle><nav className="mb-4 flex justify-between gap-3"><Link href={"?week="+addDays(week,-7)} className="text-accent">← 지난주</Link><span>{formatWeek(week)}</span>{addDays(week,7)<=todayKST()?<Link href={"?week="+addDays(week,7)} className="text-accent">다음 주 →</Link>:null}</nav><Card className="mb-5"><h2 className="font-semibold">한눈에</h2><p>제출 보고 {data.reports.length}건 · 사고/경미한 이슈 보고 {warnings.length}건 · 예배 이슈 {data.incidents.length}건</p></Card>
 <nav className="mb-4 flex flex-wrap gap-3 text-sm"><Link href={"?week="+week} className={!attention?"font-semibold text-accent":"text-muted"}>전체 사역 보고</Link><Link href={"?week="+week+"&attention=1"} className={attention?"font-semibold text-accent":"text-muted"}>확인·조치 필요한 보고만</Link></nav>
 {blocks.map(block=><WeeklyReportBlock key={block.key} block={block} names={names} senior={isSenior(profile)}/>)}
 {!blocks.length?<p className="text-sm text-muted">선택한 주차에 제출된 보고가 없습니다.</p>:null}<details className="mb-4"><summary className="cursor-pointer text-sm font-semibold">이번 주 보고가 아직 등록되지 않은 파트</summary><p className="mt-2 text-sm text-muted">{data.groups.filter(g=>!data.groups.some(c=>c.parent_id===g.id)&&!data.reports.some(r=>r.group_id===g.id)).map(g=>groupDisplayName(g.name)).join(" · ")||"모든 파트의 보고가 있습니다."}</p></details><Link href={"/meeting?week="+week} className="text-sm text-accent underline">출결·기도제목·비공개 글 등 상세 회의 자료 보기</Link></>;
}
