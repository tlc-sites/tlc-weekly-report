import {Suspense} from "react";
import Link from "next/link";
import {requireActive} from "@/lib/auth";
import {getReportIdentity} from "@/lib/report-identity";
import {reportWeek,addDays,formatWeek,todayKST} from "@/lib/week";
import {BackLink,Card,Field,Loading,PageTitle,selectClass,smallButtonClass} from "@/components/ui";

type Row={id:string;author_id:string;meeting_date:string;meeting_label:string|null;status:string;details:Record<string,unknown>;author:{real_name:string|null}|null;group:{name:string}|null;service:{name:string}|null};
export default function ReportsPage(props:PageProps<"/reports">){return <Suspense fallback={<Loading/>}><Content {...props}/></Suspense>;}
async function Content({searchParams}:PageProps<"/reports">){
  const {supabase}=await requireActive();const params=await searchParams;
  const week=reportWeek(params.week,todayKST());
  const {data,error}=await supabase.from("reports").select("id,author_id,meeting_date,meeting_label,status,details,author:profiles!reports_author_id_fkey(real_name),group:groups(name),service:service_types(name)").gte("meeting_date",week).lte("meeting_date",addDays(week,6)).order("meeting_date",{ascending:false}).returns<Row[]>();
  if(error)throw error;
  const authors=new Map((data??[]).map(r=>[r.author_id,getReportIdentity(r.details,r.author?.real_name).author_name]));
  const selected=typeof params.author==="string" && authors.has(params.author)?params.author:"";
  const sort=params.sort==="author" || params.sort==="part" ? params.sort:"date";
  const rows=(data??[]).filter(r=>!selected || r.author_id===selected).sort((a,b)=>sort==="author" ? getReportIdentity(a.details,a.author?.real_name).author_name.localeCompare(getReportIdentity(b.details,b.author?.real_name).author_name,"ko") : sort==="part" ? (a.group?.name??"").localeCompare(b.group?.name??"","ko"):b.meeting_date.localeCompare(a.meeting_date));
  return <><BackLink href="/">홈</BackLink><PageTitle sub={formatWeek(week)}>사람별 보고 모아보기</PageTitle>
    <form className="mb-4 grid gap-3 rounded-xl border border-border bg-surface p-4" method="get"><input type="hidden" name="week" value={week}/><Field label="작성자"><select name="author" defaultValue={selected} className={selectClass}><option value="">전체 작성자</option>{[...authors].sort((a,b)=>a[1].localeCompare(b[1],"ko")).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></Field><Field label="정렬"><select name="sort" defaultValue={sort} className={selectClass}><option value="date">최근 예배·모임 순</option><option value="author">작성자 이름순</option><option value="part">파트 이름순</option></select></Field><button className={smallButtonClass}>선택 적용</button></form>
    <nav className="mb-4 flex justify-between"><Link className={smallButtonClass} href={`/reports?week=${addDays(week,-7)}`}>← 지난 주</Link>{week<reportWeek(undefined,todayKST())?<Link className={smallButtonClass} href={`/reports?week=${addDays(week,7)}`}>다음 주 →</Link>:null}</nav>
    <Card><p className="mb-3 text-sm text-muted">열람 권한이 있는 보고 {rows.length}건</p><ul className="divide-y divide-border">{rows.map(r=><li key={r.id}><Link href={`/reports/${r.id}`} className="block py-3"><p className="font-semibold">{getReportIdentity(r.details,r.author?.real_name).author_name} · {r.group?.name}</p><p className="mt-1 text-sm text-muted">{r.meeting_date} · {r.service?.name ?? r.meeting_label ?? "모임"} · {getReportIdentity(r.details).duty_part}</p></Link></li>)}</ul>{!rows.length?<p>이 주차에 표시할 보고가 없습니다.</p>:null}</Card>
  </>;
}
