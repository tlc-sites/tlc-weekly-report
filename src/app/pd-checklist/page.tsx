import {Suspense} from "react";
import {canSeePdChecklist} from "@/lib/pd-access";
import {redirect} from "next/navigation";
import {requireActive,canManage} from "@/lib/auth";
import {isIsoDate,todayKST} from "@/lib/week";
import {nextServiceDate,scheduleLabel,shortDate,templateSchedule,upcomingLabel,type ServiceTypeRow} from "@/lib/pd-schedule";
import type {PdRun,PdTemplate} from "@/lib/pd-checklist";
import {Card,Loading,PageTitle} from "@/components/ui";
import {PdChecklist} from "./checklist";
import "./pd-checklist.css";
import "./pd-plain.css";

export default function Page(props:PageProps<"/pd-checklist">){return <Suspense fallback={<Loading/>}><Content {...props}/></Suspense>;}

// 예배 PD 체크리스트: 템플릿(예배별 최신 버전)과 날짜 × 예배 회차를 읽어 화면에 넘긴다. 회차가 있으면 그 회차를 만든 버전의 템플릿으로 그린다.
async function Content({searchParams}:PageProps<"/pd-checklist">){
 const {supabase,profile}=await requireActive();
 if(!(await canSeePdChecklist(supabase,profile)))redirect("/");
 const q=await searchParams;
 const [{data:rows,error},{data:removed},{data:types}]=await Promise.all([
  supabase.from("pd_templates").select("service_key,version,content").order("version",{ascending:false}),
  // 관리자가 지운 예배(DB 62)는 목록에서 뺀다. DB 적용 전이면 오류라 빈 목록
  supabase.from("pd_service_removed").select("service_key"),
  // 예배 목록의 요일·주차(수요예배·금요 예배). 읽지 못하면 모두 주일로 본다.
  supabase.from("service_types").select("name,weekday,month_week,is_active"),
 ]);
 const gone=new Set((removed??[]).map(r=>r.service_key as string));
 const latest=new Map<string,{version:number;content:PdTemplate}>();
 for(const r of rows??[])if(!gone.has(r.service_key)&&!latest.has(r.service_key))latest.set(r.service_key,{version:r.version,content:r.content as PdTemplate});
 if(error||!latest.size)return <><PageTitle>예배 PD 체크리스트</PageTitle><Card><p>체크리스트를 불러오지 못했습니다.</p><p className="mt-1 text-sm text-muted">{error?"DB 적용 전이거나 연결 오류입니다. 관리자에게 알려 주세요.":"등록된 예배 템플릿이 없습니다."}</p></Card></>;

 // 예배 선택 목록: 주일 → 수요일 → 금요일 순, 같은 요일은 시작 시각 순
 const typeRows=(types??[]) as ServiceTypeRow[];
 const services=[...latest.entries()].map(([key,t])=>({key,name:t.content.name,start:t.content.start,sched:templateSchedule(key,t.content.name,typeRows)}))
  .sort((a,b)=>a.sched.weekday-b.sched.weekday||a.start.localeCompare(b.start));
 const service=typeof q.service==="string"&&latest.has(q.service)?q.service:services[0].key;
 // 날짜는 그 예배가 열리는 날로 맞춘다(예배 목록의 요일·주차). 날짜를 안 주면 오늘부터 가장 가까운 그 예배 날.
 const sched=services.find(s=>s.key===service)!.sched;
 const today=todayKST();
 const asked=typeof q.date==="string"&&isIsoDate(q.date)?q.date:null;
 const date=nextServiceDate(asked??today,sched);
 const defaultDate=nextServiceDate(today,sched);
 const dateNote=asked&&asked!==date?`${latest.get(service)!.content.name}는 ${scheduleLabel(sched)} 예배라 ${shortDate(date)}로 맞췄습니다.`:undefined;
 // 작성자 지정(DB48): PD 체크리스트 작성자가 아니면 보기 전용(담당자·송리스트는 큐시트 작성자도 큐시트에서 고친다).
 const {data:pdOk}=await supabase.rpc("can_write_worship_doc",{kind:"pd"});
 const {data:run}=await supabase.from("pd_runs").select("service_key,run_date,template_version,pd_name,conditions,checks,roster,report,updated_at").eq("service_key",service).eq("run_date",date).maybeSingle<PdRun>();
 const cur=latest.get(service)!;
 let template=cur.content;
 if(run&&run.template_version!==cur.version){
  const {data:old}=await supabase.from("pd_templates").select("content").eq("service_key",service).eq("version",run.template_version).maybeSingle();
  if(old)template=old.content as PdTemplate;
 }
 return <><span className="page-wide" hidden/><PdChecklist key={service+date} services={services.map(({key,name,start})=>({key,name,start}))} service={service} date={date} defaultDate={defaultDate} defaultLabel={upcomingLabel(sched.weekday)} dateNote={dateNote} template={template} version={run?.template_version??cur.version} latestVersion={cur.version} initialRun={run??null} canEdit={canManage(profile)} readOnly={!pdOk}/></>;
}
