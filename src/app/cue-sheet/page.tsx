import {Suspense} from "react";
import {requireActive} from "@/lib/auth";
import {addDays,isIsoDate,todayKST,weekdayOf} from "@/lib/week";
import {upcomingSunday} from "@/lib/sunday-notice";
import type {PdRun,PdTemplate} from "@/lib/pd-checklist";
import {Card,Loading,PageTitle} from "@/components/ui";
import {CueSheet,type CueService} from "./cue-sheet";
import "./cue-sheet.css";

export default function Page(props:PageProps<"/cue-sheet">){return <Suspense fallback={<Loading/>}><Content {...props}/></Suspense>;}

// 주일예배 큐시트: 그 주일의 예배(1부~라이프라인)를 한 화면에서 쓰고, 예배마다 한글·영어 한 장씩(양면) 인쇄한다.
// 값은 PD 회차(pd_runs)의 roster·PD 이름에 저장해 PD 체크리스트 담당자 칸·송리스트와 같이 쓴다.
async function Content({searchParams}:PageProps<"/cue-sheet">){
 const {supabase}=await requireActive();
 const q=await searchParams;
 const picked=typeof q.date==="string"&&isIsoDate(q.date)?q.date:todayKST();
 const date=weekdayOf(picked)===0?picked:addDays(picked,(7-weekdayOf(picked))%7);
 const [{data:rows,error},{data:runs}]=await Promise.all([
  supabase.from("pd_templates").select("service_key,version,content").order("version",{ascending:false}),
  supabase.from("pd_runs").select("service_key,run_date,template_version,pd_name,conditions,checks,roster,report,updated_at").eq("run_date",date),
 ]);
 const latest=new Map<string,PdTemplate>();
 for(const r of rows??[])if(!latest.has(r.service_key))latest.set(r.service_key,r.content as PdTemplate);
 const byService=new Map(((runs??[]) as PdRun[]).map(r=>[r.service_key,r]));
 const services:CueService[]=[...latest.entries()].filter(([,t])=>t.cue).map(([key,t])=>({key,name:t.name,start:t.start,cue:t.cue!,roster:byService.get(key)?.roster??{},pd:byService.get(key)?.pd_name??""}))
  .sort((a,b)=>a.start.localeCompare(b.start));
 if(error||!services.length)return <><PageTitle>주일예배 큐시트</PageTitle><Card><p>큐시트를 불러오지 못했습니다.</p><p className="mt-1 text-sm text-muted">{error?"연결 오류입니다. 잠시 뒤 다시 열어 주세요.":"큐시트 양식이 있는 예배가 없습니다. 관리자에게 알려 주세요."}</p></Card></>;
 return <><span className="page-wide" hidden/><CueSheet key={date} date={date} defaultDate={upcomingSunday(todayKST())} services={services}/></>;
}
