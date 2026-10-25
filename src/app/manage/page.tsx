import {groupDisplayName} from "@/lib/group-display";
import {WeeklyReportBlock} from "@/components/weekly-report-block";
import {Suspense} from "react";
import Link from "@/components/pending-link";
import {redirect} from "next/navigation";
import {requireActive,isClergy,isSenior,canManage} from "@/lib/auth";
import {loadAdminSubmissions} from "@/lib/admin-submissions";
import {loadWeeklySummary} from "@/lib/weekly-summary-data";
import {weeklyBlocks} from "@/lib/weekly-summary";
import {reportWeek,todayKST,formatWeek,addDays} from "@/lib/week";
import {Card,PageTitle,Loading} from "@/components/ui";
import {HELP} from "@/lib/help-text";
export default function Page(props:PageProps<"/manage">){return <Suspense fallback={<Loading/>}><Content {...props}/></Suspense>;}
async function Content({searchParams}:PageProps<"/manage">){const {supabase,profile}=await requireActive();if(!canManage(profile)&&!isClergy(profile))redirect("/");const q=await searchParams;const week=reportWeek(q.week,todayKST());const admin=canManage(profile)?await loadAdminSubmissions(supabase,week):null;const summary=isSenior(profile)?await loadWeeklySummary(supabase,week):null;
 const links=[...(canManage(profile)?[["/admin/submissions?week="+week,"전체 제출현황"],["/admin/users","가입 승인 · 담당자 지정"],["/admin/groups","그룹 관리"],["/admin/services","예배 목록"]]:[]),...(isClergy(profile)?[["/team-management","담당 팀 명단 관리"],["/weekly-summary?week="+week,"주간 전체 요약"],["/meeting?week="+week,"출결 · 기도제목 · 회의 자료"]] :[])];
 return <><PageTitle info={HELP.manage} sub={formatWeek(week)}>{isSenior(profile)?"전체 사역 관리":"관리"}</PageTitle><nav className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm"><Link href={"?week="+addDays(week,-7)} className="rounded-xl border border-border px-3 py-2">← 지난주</Link>{addDays(week,7)<=todayKST()?<Link href={"?week="+addDays(week,7)} className="rounded-xl border border-border px-3 py-2">다음 주 →</Link>:null}</nav>{admin?<Card className="mb-4"><h2 className="font-semibold">전체 제출현황</h2><p className="mt-2">등록된 보고 {admin.reports.length}건 · 담당 파트 {admin.groups.length}개</p></Card>:null}<div className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-2">{links.map(([href,label])=><Link key={href} href={href} className="flex min-h-16 min-w-0 items-center justify-center rounded-xl border border-border bg-surface p-4 text-center font-semibold text-accent">{label}</Link>)}</div>{summary?<><h2 className="mb-3 font-semibold">이번 주 전체 보고</h2>{weeklyBlocks(summary.reports,summary.groups,summary.incidents).map(block=><WeeklyReportBlock key={block.key} block={block} names={new Map(summary.groups.map(g=>[g.id,groupDisplayName(g.name)]))} senior/>)}{!summary.reports.length?<p className="text-muted">아직 제출된 보고가 없습니다.</p>:null}</>:null}<Link href="/incidents" className="mt-5 rounded-xl border border-border p-4 text-center font-semibold">확인·조치 목록</Link><a href="/staff-guide.html" className="mt-6 text-center text-sm font-semibold text-accent">📖 교역자·관리자 사용 안내</a></>;
}
