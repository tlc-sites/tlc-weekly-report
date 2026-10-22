import {meetingDisplayName} from "@/lib/group-display";
import {Suspense} from "react";
import Link from "next/link";
import {requireActive} from "@/lib/auth";
import {getReportIdentity} from "@/lib/report-identity";
import {reportWeek,addDays,formatWeek,todayKST} from "@/lib/week";
import {BackLink,Card,Field,Loading,PageTitle,selectClass,smallButtonClass} from "@/components/ui";
import {ReportStatusBadge} from "@/components/report-status";
import type {ReportStatus} from "@/lib/report-forms";

type Row={id:string;author_id:string;meeting_date:string;meeting_label:string|null;status:ReportStatus;submitted_at:string|null;details:Record<string,unknown>;author:{real_name:string|null}|null;group:{name:string}|null;service:{name:string}|null};
export default function ReportsPage(props:PageProps<"/reports">){return <Suspense fallback={<Loading/>}><Content {...props}/></Suspense>;}
async function Content({searchParams}:PageProps<"/reports">){
  const {supabase}=await requireActive();const params=await searchParams;
  const week=reportWeek(params.week,todayKST());
  const {data,error}=await supabase.from("reports").select("id,author_id,meeting_date,meeting_label,status,submitted_at,details,author:profiles!reports_author_id_fkey(real_name),group:groups(name),service:service_types(name)").gte("meeting_date",week).lte("meeting_date",addDays(week,6)).order("meeting_date",{ascending:false}).returns<Row[]>();
  if(error)throw error;
  const authors=new Map((data??[]).map(r=>[r.author_id,getReportIdentity(r.details,r.author?.real_name).author_name]));
  const selected=typeof params.author==="string" && /^[0-9a-f-]{36}$/i.test(params.author)?params.author:"";
  if(selected && !authors.has(selected)) authors.set(selected,"선택한 작성자 (이 주차 보고 없음)");
  const sort=params.sort==="author" || params.sort==="part" ? params.sort:"date";
  const status = ["draft","submitted","reviewed","sent"].includes(String(params.status)) ? String(params.status) : "all";
  const rows=(data??[]).filter(r=>(!selected || r.author_id===selected) && (status==="all" || (status==="sent" ? r.status!=="draft" : r.status===status))).sort((a,b)=>sort==="author" ? getReportIdentity(a.details,a.author?.real_name).author_name.localeCompare(getReportIdentity(b.details,b.author?.real_name).author_name,"ko") : sort==="part" ? (a.group?.name??"").localeCompare(b.group?.name??"","ko"):b.meeting_date.localeCompare(a.meeting_date));
  const weekHref=(next:string)=>`/reports?${new URLSearchParams({week:next,author:selected,sort,status})}`;
  return <><BackLink href={`/?week=${week}`}>홈 · 제출현황</BackLink><PageTitle sub={formatWeek(week)}>보고 목록 · 제출현황</PageTitle>
    <nav aria-label="보고 주차 이동" className="mb-4 flex flex-wrap gap-2"><Link className={smallButtonClass} href={weekHref(addDays(week,-7))}>← 지난 주</Link>{week<reportWeek(undefined,todayKST())?<><Link className={smallButtonClass} href={weekHref(addDays(week,7))}>다음 주 →</Link><Link className={smallButtonClass} href={weekHref(reportWeek(undefined,todayKST()))}>이번 주</Link></>:null}</nav>
    <form className="mb-4 grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2" method="get"><input type="hidden" name="week" value={week}/><Field label="제출 상태"><select name="status" defaultValue={status} className={selectClass}><option value="all">전체 상태</option><option value="draft">작성 중 · 아직 미제출</option><option value="sent">제출 완료 전체 (확인 완료 포함)</option><option value="submitted">제출 완료 · 확인 대기</option><option value="reviewed">확인 완료</option></select></Field><Field label="작성자"><select name="author" defaultValue={selected} className={selectClass}><option value="">전체 작성자</option>{[...authors].sort((a,b)=>a[1].localeCompare(b[1],"ko")).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></Field><Field label="정렬"><select name="sort" defaultValue={sort} className={selectClass}><option value="date">최근 예배·모임 순</option><option value="author">작성자 이름순</option><option value="part">파트 이름순</option></select></Field><button className={`${smallButtonClass} self-end`}>선택 적용</button></form>
    <Card><p className="mb-3 text-sm text-muted">내 열람 범위에서 조건에 맞는 보고 {rows.length}건</p><ul className="divide-y divide-border">{rows.map(r=><li key={r.id}><Link href={`/reports/${r.id}`} className="block py-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{getReportIdentity(r.details,r.author?.real_name).author_name} · {r.group?.name}</p><ReportStatusBadge status={r.status}/></div><p className="mt-1 text-sm text-muted">{r.meeting_date} · {meetingDisplayName(r.service?.name ?? r.meeting_label ?? "모임")} · {getReportIdentity(r.details).duty_part}</p>{r.submitted_at && r.status!=="draft" ? <p className="mt-1 text-xs text-muted">제출 시각 {new Date(r.submitted_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false})}</p>:null}</Link></li>)}</ul>{!rows.length?<p>조건에 맞는 보고가 없습니다. 제출 상태나 작성자 선택을 바꿔 주세요.</p>:null}</Card>
  </>;
}
