import {groupDisplayName} from "@/lib/group-display";
import {WeeklyReportBlock} from "@/components/weekly-report-block";
import {PriorityReportList} from "@/components/priority-report-list";
import {Suspense} from "react";
import Link from "@/components/pending-link";
import {redirect} from "next/navigation";
import {requireActive,isClergy,isSenior} from "@/lib/auth";
import {Loading,Card,PageTitle} from "@/components/ui";
import {loadWeeklySummary} from "@/lib/weekly-summary-data";
import {weeklyBlocks} from "@/lib/weekly-summary";
import {isUnread,priorityTiers} from "@/lib/senior-priority";
import {reportWeek,todayKST,addDays,formatWeek} from "@/lib/week";
import {HELP} from "@/lib/help-text";
export default function Page(props:PageProps<"/weekly-summary">){return <Suspense fallback={<Loading/>}><Content {...props}/></Suspense>;}
async function Content({searchParams}:PageProps<"/weekly-summary">){
 const {supabase,profile}=await requireActive();if(!isClergy(profile))redirect("/");
 const query=await searchParams;const week=reportWeek(query.week,todayKST());const data=await loadWeeklySummary(supabase,week);
 const senior=isSenior(profile),role=profile.recipient_role;
 // 담임 목사님·사모님은 '중요한 것부터'로, 교역자는 지금처럼 예배별로 먼저 연다. 둘 다 버튼으로 바꿀 수 있다.
 const view=query.view==="priority"||query.view==="service"?query.view:senior?"priority":"service";
 const attention=query.attention==="1",unreadOnly=senior&&query.unread==="1";
 const ids=data.reports.map(r=>r.id);
 // 순서를 정하는 데만 쓴다: 나에게 온 글이 있는지(본문은 읽지 않음), 지금 판을 열어 봤는지. 둘 다 기존 RLS 그대로.
 const [msgRes,readRes]=senior&&role&&ids.length?await Promise.all([
  supabase.from("report_messages").select("report_id").eq("recipient",role).in("report_id",ids),
  supabase.from("senior_report_reads").select("report_id,report_version").eq("recipient_role",role).in("report_id",ids),
 ]):[null,null];
 if(msgRes?.error)throw msgRes.error;if(readRes?.error)throw readRes.error;
 const messageIds=new Set((msgRes?.data??[]).map(m=>m.report_id as string));
 const readVersions=new Map((readRes?.data??[]).map(r=>[r.report_id as string,r.report_version as string]));
 let reports=attention?data.reports.filter(r=>r.details.needs_attention===true&&r.details.attention_status!=="resolved"):data.reports;
 let incidents=attention?data.incidents.filter(i=>i.status!=="resolved"):data.incidents;
 if(unreadOnly){reports=reports.filter(r=>isUnread(r,readVersions));incidents=[];}
 const names=new Map(data.groups.map(g=>[g.id,groupDisplayName(g.name)]));
 const warnings=data.reports.filter(r=>r.details.result==="minor"||r.details.result==="incident");
 const unreadCount=senior?data.reports.filter(r=>isUnread(r,readVersions)).length:0;
 const href=(p:Record<string,string|false>)=>"?"+new URLSearchParams(Object.entries({week,view,attention:attention&&"1",unread:unreadOnly&&"1",...p}).filter((e):e is [string,string]=>Boolean(e[1])));
 const pill=(on:boolean)=>`inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 font-semibold ${on?"border-accent bg-accent text-accent-foreground":"border-border bg-surface text-muted hover:text-accent"}`;
 const empty=unreadOnly?"이 주에 안 읽은 보고가 없습니다.":"선택한 주차에 제출된 보고가 없습니다.";
 const blocks=view==="service"?weeklyBlocks(reports,data.groups,incidents):[];
 return <><Link href="/" className="mb-4 inline-flex min-h-11 items-center text-accent">← 홈</Link><span className="page-wide" hidden /><PageTitle info={HELP.summary} sub={view==="priority"?"예배 사고·확인 필요 → 두 분께 드리는 글 → 살펴볼 것 → 이상 없음 순서입니다. 열람 권한이 있는 내용만 표시합니다.":"예배별 예배·기술팀 → 교회학교별 → 그 외 팀별로 모았습니다. 열람 권한이 있는 내용만 표시합니다."}>주간 요약</PageTitle>
  <nav className="mb-4 flex justify-between gap-3"><Link href={href({week:addDays(week,-7)})} className="text-accent">← 지난주</Link><span>{formatWeek(week)}</span>{addDays(week,7)<=todayKST()?<Link href={href({week:addDays(week,7)})} className="text-accent">다음 주 →</Link>:null}</nav>
  <Card className="mb-5"><h2 className="font-semibold">한눈에</h2><p>제출 보고 {data.reports.length}건 · 사고/경미한 이슈 보고 {warnings.length}건 · 예배 이슈 {data.incidents.length}건{senior?` · 안 읽은 보고 ${unreadCount}건`:""}</p></Card>
  <nav aria-label="보기 방식" className="mb-3 grid grid-cols-2 gap-1 rounded-2xl border border-border bg-surface p-1">{([["priority","중요한 것부터"],["service","예배별"]] as const).map(([v,label])=><Link key={v} href={href({view:v})} aria-current={view===v?"page":undefined} className={`flex min-h-11 items-center justify-center rounded-xl font-semibold ${view===v?"bg-accent text-accent-foreground":"text-muted"}`}>{label}</Link>)}</nav>
  <nav aria-label="걸러 보기" className="mb-4 flex gap-2 overflow-x-auto pb-1"><Link href={href({attention:false,unread:false})} aria-current={!attention&&!unreadOnly?"page":undefined} className={pill(!attention&&!unreadOnly)}>전체</Link>{senior?<Link href={href({unread:"1",attention:false})} aria-current={unreadOnly?"page":undefined} className={pill(unreadOnly)}>안 읽은 보고만</Link>:null}<Link href={href({attention:"1",unread:false})} aria-current={attention?"page":undefined} className={pill(attention)}>확인·조치 필요만</Link></nav>
  {view==="priority"
   ?<PriorityReportList tiers={priorityTiers(reports,incidents,messageIds)} names={names} senior={senior} messageIds={messageIds} readVersions={readVersions} emptyText={empty}/>
   :<>{blocks.map(block=><WeeklyReportBlock key={block.key} block={block} names={names} senior={senior}/>)}{!blocks.length?<p className="text-muted">{empty}</p>:null}</>}
  <details className="mb-4"><summary className="flex min-h-11 cursor-pointer items-center font-semibold">이번 주 보고가 아직 등록되지 않은 파트</summary><p className="mt-2 text-muted">{data.groups.filter(g=>!data.groups.some(c=>c.parent_id===g.id)&&!data.reports.some(r=>r.group_id===g.id)).map(g=>groupDisplayName(g.name)).join(" · ")||"모든 파트의 보고가 있습니다."}</p></details><Link href={"/meeting?week="+week} className="text-accent underline">출결·기도제목·비공개 글 등 상세 회의 자료 보기</Link></>;
}
