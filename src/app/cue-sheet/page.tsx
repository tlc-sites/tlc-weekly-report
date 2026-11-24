import {Suspense} from "react";
import {canSeePdChecklist} from "@/lib/pd-access";
import {requireActive} from "@/lib/auth";
import {addDays,isIsoDate,todayKST,weekdayOf} from "@/lib/week";
import {cueDayName,cueLabelFor,occursOn,templateSchedule,upcomingLabel,type ServiceTypeRow} from "@/lib/pd-schedule";
import {defaultConditions,serviceColor,type PdRun,type PdTemplate} from "@/lib/pd-checklist";
import {Card,Loading,PageTitle} from "@/components/ui";
import {CueSheet,type CueService} from "./cue-sheet";
import "../pd-checklist/pd-checklist.css";
import "./cue-sheet.css";

export default function Page(props:PageProps<"/cue-sheet">){return <Suspense fallback={<Loading/>}><Content {...props}/></Suspense>;}

// 예배 큐시트: 고른 날짜에 열리는 예배(주일 1부~라이프라인, 수요예배, 금요 예배)를 한 세트로 인쇄될 모양 그대로 쓰고, 예배마다 한글·영어 한 장씩(A4 가로, 양면) 인쇄한다.
// 값은 PD 회차(pd_runs)의 roster·PD 이름·조건(성찬주간)에 저장해 PD 체크리스트 담당자 칸·송리스트와 같이 쓴다.
async function Content({searchParams}:PageProps<"/cue-sheet">){
 const {supabase,profile}=await requireActive();
 const q=await searchParams;
 const asked=typeof q.date==="string"&&isIsoDate(q.date)?q.date:null;
 const today=todayKST();
 const [{data:rows,error},cueOk,pdOk,{data:removed},{data:types}]=await Promise.all([
  supabase.from("pd_templates").select("service_key,version,content").order("version",{ascending:false}),
  // 작성자 지정(DB48): 큐시트 칸은 큐시트 또는 PD 체크리스트 작성자가 고친다. 아니면 보기 전용.
  supabase.rpc("can_write_worship_doc",{kind:"cue"}),
  supabase.rpc("can_write_worship_doc",{kind:"pd"}),
  // 관리자가 지운 예배(DB 62)는 뺀다
  supabase.from("pd_service_removed").select("service_key"),
  // 예배 목록의 요일·주차: 그날 열리는 예배만 보여 준다
  supabase.from("service_types").select("name,weekday,month_week,is_active"),
 ]);
 const gone=new Set((removed??[]).map(r=>r.service_key as string));
 const showPd=await canSeePdChecklist(supabase,profile);
 const canWrite=Boolean(cueOk.data||pdOk.data);
 const latest=new Map<string,PdTemplate>();
 for(const r of rows??[])if(!gone.has(r.service_key)&&!latest.has(r.service_key))latest.set(r.service_key,r.content as PdTemplate);
 const typeRows=(types??[]) as ServiceTypeRow[];
 const all=[...latest.entries()].filter(([,t])=>t.cue).map(([key,t])=>({key,t,sched:templateSchedule(key,t.name,typeRows)}));
 const holds=(d:string)=>all.some(a=>occursOn(d,a.sched));
 // 가장 가까운 예배 날(오늘 포함). 날짜를 안 주면 그날을 연다.
 const nextHeld=(from:string,weekday?:number)=>{for(let i=0;i<=70;i++){const d=addDays(from,i);if((weekday===undefined||weekdayOf(d)===weekday)&&holds(d))return d;}return from;};
 const date=asked??nextHeld(today);
 // 「돌아오는 주일·수요일·금요일」 버튼: 양식이 있는 요일마다
 const days=[...new Set(all.map(a=>a.sched.weekday))].sort((a,b)=>a-b);
 const quick=days.map(w=>({label:upcomingLabel(w),date:nextHeld(today,w)}));
 const {data:runs}=await supabase.from("pd_runs").select("service_key,run_date,template_version,pd_name,conditions,checks,roster,report,updated_at").eq("run_date",date);
 const byService=new Map(((runs??[]) as PdRun[]).map(r=>[r.service_key,r]));
 const services:CueService[]=all.filter(a=>occursOn(date,a.sched)).map(({key,t,sched})=>{const run=byService.get(key);return {key,name:t.name,start:t.start,color:serviceColor({id:key,color:t.color}),cue:{...t.cue!,label:cueLabelFor(key,t.cue!.label,t.name,sched)},roster:run?.roster??{},pd:run?.pd_name??"",
  conditions:{...defaultConditions(t,date),...run?.conditions},hasCommunion:t.conditions.some(c=>c.id==="communion")};})
  .sort((a,b)=>a.start.localeCompare(b.start));
 if(error||!all.length)return <><PageTitle>예배 큐시트</PageTitle><Card><p>큐시트를 불러오지 못했습니다.</p><p className="mt-1 text-sm text-muted">{error?"연결 오류입니다. 잠시 뒤 다시 열어 주세요.":"큐시트 양식이 있는 예배가 없습니다. 관리자에게 알려 주세요."}</p></Card></>;
 return <><span className="page-wide" hidden/><CueSheet key={date} date={date} quick={quick} dayName={cueDayName(weekdayOf(date))} next={nextHeld(addDays(date,1))} services={services} readOnly={!canWrite} showPd={showPd}/></>;
}
