import {Suspense} from "react";
import Link from "@/components/pending-link";
import {requireActive,isClergy} from "@/lib/auth";
import {todayKST} from "@/lib/week";
import {BackLink,Loading,PageTitle,smallButtonClass} from "@/components/ui";
import {isMonth,monthOccurrences,monthRange,shiftMonth} from "@/lib/worship-staff-month";
import {MonthStaffGrid} from "./month-grid";

export default function Page(props:PageProps<"/worship-staff/month">){return <Suspense fallback={<Loading/>}><Content {...props}/></Suspense>;}

// 예배위원 한 달 표: 그 달 모든 예배·날짜의 안내·헌금·봉독을 한 화면에서 보고, 스프레드시트를 붙여넣어 한 번에 채운다.
async function Content({searchParams}:PageProps<"/worship-staff/month">){
 const {supabase,profile}=await requireActive();
 const q=await searchParams;
 const month=isMonth(q.month)?q.month:todayKST().slice(0,7);
 const {first,last}=monthRange(month);
 const [{data:services,error:se},{data:saved,error:re}]=await Promise.all([
  supabase.from("service_types").select("id,name,weekday,month_week").eq("is_active",true).order("sort_order").order("name"),
  supabase.from("worship_staff").select("service_id,held_on,staff,updated_at").gte("held_on",first).lte("held_on",last),
 ]);
 if(se)throw se;if(re)throw re;
 const rows=monthOccurrences(month,services??[]).map(o=>{const s=saved?.find(r=>r.service_id===o.serviceId&&r.held_on===o.date);return {...o,staff:(s?.staff as string|undefined)??"",updatedAt:(s?.updated_at as string|undefined)??null};});
 const [y,m]=month.split("-").map(Number);
 const nav=<nav aria-label="달 이동" className="week-nav mb-4 flex flex-wrap gap-2"><Link className={smallButtonClass} href={`/worship-staff/month?month=${shiftMonth(month,-1)}`}>← 지난달</Link><Link className={smallButtonClass} href={`/worship-staff/month?month=${shiftMonth(month,1)}`}>다음 달 →</Link>{month!==todayKST().slice(0,7)?<Link className={smallButtonClass} href="/worship-staff/month">이번 달</Link>:null}</nav>;
 return <><BackLink href="/worship-staff">예배위원</BackLink><span className="page-wide" hidden/>
  <PageTitle sub={isClergy(profile)?"스프레드시트에서 표를 복사해 붙여넣으면 칸이 채워집니다. 확인한 뒤 저장해 주세요.":"한 달 예배위원 명단입니다. 입력은 교역자가 합니다."}>예배위원 · {y}년 {m}월</PageTitle>
  {nav}
  {rows.length?<MonthStaffGrid key={month} month={month} rows={rows} editable={isClergy(profile)}/>:<p className="text-sm text-muted">이 달에 요일이 정해진 예배가 없습니다.</p>}
 </>;
}
