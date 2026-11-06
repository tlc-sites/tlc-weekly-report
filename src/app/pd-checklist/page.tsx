import {Suspense} from "react";
import {requireActive,canManage} from "@/lib/auth";
import {addDays,isIsoDate,todayKST,weekdayOf} from "@/lib/week";
import {upcomingSunday} from "@/lib/sunday-notice";
import type {PdRun,PdTemplate} from "@/lib/pd-checklist";
import {Card,Loading,PageTitle} from "@/components/ui";
import {PdChecklist} from "./checklist";
import "./pd-checklist.css";

export default function Page(props:PageProps<"/pd-checklist">){return <Suspense fallback={<Loading/>}><Content {...props}/></Suspense>;}

// 예배 PD 체크리스트: 템플릿(예배별 최신 버전)과 날짜 × 예배 회차를 읽어 화면에 넘긴다. 회차가 있으면 그 회차를 만든 버전의 템플릿으로 그린다.
async function Content({searchParams}:PageProps<"/pd-checklist">){
 const {supabase,profile}=await requireActive();
 const q=await searchParams;
 const {data:rows,error}=await supabase.from("pd_templates").select("service_key,version,content").order("version",{ascending:false});
 const latest=new Map<string,{version:number;content:PdTemplate}>();
 for(const r of rows??[])if(!latest.has(r.service_key))latest.set(r.service_key,{version:r.version,content:r.content as PdTemplate});
 if(error||!latest.size)return <><PageTitle>예배 PD 체크리스트</PageTitle><Card><p>체크리스트를 불러오지 못했습니다.</p><p className="mt-1 text-sm text-muted">{error?"DB 적용 전이거나 연결 오류입니다. 관리자에게 알려 주세요.":"등록된 예배 템플릿이 없습니다."}</p></Card></>;

 // 예배 선택 목록은 시작 시각 순서(1부 → 2부 → 3부 → 라이프라인)
 const services=[...latest.entries()].map(([key,t])=>({key,name:t.content.name,start:t.content.start})).sort((a,b)=>a.start.localeCompare(b.start));
 const service=typeof q.service==="string"&&latest.has(q.service)?q.service:services[0].key;
 // 모든 예배는 주일 날짜로 저장한다. 다른 요일을 고르면 그 주의 주일로 맞춘다.
 const picked=typeof q.date==="string"&&isIsoDate(q.date)?q.date:todayKST();
 const date=weekdayOf(picked)===0?picked:addDays(picked,(7-weekdayOf(picked))%7);
 const {data:run}=await supabase.from("pd_runs").select("service_key,run_date,template_version,pd_name,conditions,checks,roster,report,updated_at").eq("service_key",service).eq("run_date",date).maybeSingle<PdRun>();
 const cur=latest.get(service)!;
 let template=cur.content;
 if(run&&run.template_version!==cur.version){
  const {data:old}=await supabase.from("pd_templates").select("content").eq("service_key",service).eq("version",run.template_version).maybeSingle();
  if(old)template=old.content as PdTemplate;
 }
 return <><span className="page-wide" hidden/><PdChecklist key={service+date} services={services} service={service} date={date} defaultDate={upcomingSunday(todayKST())} template={template} version={run?.template_version??cur.version} latestVersion={cur.version} initialRun={run??null} canEdit={canManage(profile)}/></>;
}
