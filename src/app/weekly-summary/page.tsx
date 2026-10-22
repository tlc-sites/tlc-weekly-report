import {AutoTranslation} from "@/components/auto-translation";
import {Suspense} from "react";
import Link from "@/components/pending-link";
import {redirect} from "next/navigation";
import {requireActive,isClergy,isSenior} from "@/lib/auth";
import {Loading,Card,PageTitle,Badge} from "@/components/ui";
import {loadWeeklySummary} from "@/lib/weekly-summary-data";
import {weeklyBlocks,reportSummaryLines} from "@/lib/weekly-summary";
import {reportWeek,todayKST,addDays,formatWeek} from "@/lib/week";
export default function Page(props:PageProps<"/weekly-summary">){return <Suspense fallback={<Loading/>}><Content {...props}/></Suspense>;}
async function Content({searchParams}:PageProps<"/weekly-summary">){
 const {supabase,profile}=await requireActive();if(!isClergy(profile))redirect("/");
 const query=await searchParams;const week=reportWeek(query.week,todayKST());const data=await loadWeeklySummary(supabase,week);
 const blocks=weeklyBlocks(data.reports,data.groups,data.incidents),names=new Map(data.groups.map(g=>[g.id,g.name]));
 const warnings=data.reports.filter(r=>r.details.result==="minor"||r.details.result==="incident");
 return <><Link href="/" className="mb-4 text-sm text-accent">← 홈</Link><PageTitle sub="예배별 예배·기술팀 → 교육부서별 → 그 외 팀별로 모았습니다. 열람 권한이 있는 내용만 표시합니다.">주간 요약</PageTitle><nav className="mb-4 flex justify-between gap-3"><Link href={"?week="+addDays(week,-7)} className="text-accent">← 지난주</Link><span>{formatWeek(week)}</span>{addDays(week,7)<=todayKST()?<Link href={"?week="+addDays(week,7)} className="text-accent">다음 주 →</Link>:null}</nav><Card className="mb-5"><h2 className="font-semibold">한눈에</h2><p>제출 보고 {data.reports.length}건 · 사고/경미한 이슈 보고 {warnings.length}건 · 예배 이슈 {data.incidents.length}건</p></Card>
 {blocks.map(b=><section key={b.key} className="mb-5"><h2 className="mb-2 font-semibold text-accent">{b.title}</h2><Card>{b.reports.map(r=><article key={r.id} className="border-b border-border py-4 last:border-0"><h3 className="font-semibold">{names.get(r.group_id)} · {r.author_name||"작성자"}{r.duty_part?" · "+r.duty_part:""}</h3>{r.details.result==="minor"||r.details.result==="incident"?<Badge tone="danger">{r.details.result==="incident"?"예배 사고":"경미한 이슈"}</Badge>:null}{isSenior(profile)?<AutoTranslation kind="report" id={r.id} source={reportSummaryLines(r).join("\n")} senior/>:null}{reportSummaryLines(r).map((line,i)=><p key={i} className="mt-2 whitespace-pre-wrap text-sm">{line}</p>)}<Link href={"/reports/"+r.id} className="mt-2 inline-block text-sm text-accent underline">보고 원문 · 코멘트 보기</Link></article>)}{b.incidents.map(i=><article key={i.id} className="mt-3 rounded-xl border border-danger/30 p-3"><h3 className="font-semibold">{i.title}</h3><p className="mt-2 whitespace-pre-wrap text-sm">{i.circumstances}</p><p className="mt-2 whitespace-pre-wrap text-sm">조치: {i.response||"기록 없음"}</p><Link href={"/incidents/"+i.id} className="text-sm text-accent underline">이슈 원문 · 코멘트 보기</Link></article>)}</Card></section>)}
 {!blocks.length?<p className="text-sm text-muted">선택한 주차에 제출된 보고가 없습니다.</p>:null}<details className="mb-4"><summary className="cursor-pointer text-sm font-semibold">이번 주 보고가 아직 등록되지 않은 파트</summary><p className="mt-2 text-sm text-muted">{data.groups.filter(g=>!data.groups.some(c=>c.parent_id===g.id)&&!data.reports.some(r=>r.group_id===g.id)).map(g=>g.name).join(" · ")||"모든 파트의 보고가 있습니다."}</p></details><Link href={"/meeting?week="+week} className="text-sm text-accent underline">출결·기도제목·비공개 글 등 상세 회의 자료 보기</Link></>;
}
