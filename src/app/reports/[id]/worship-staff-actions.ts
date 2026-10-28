"use server";

import {requireActive,isClergy} from "@/lib/auth";
import {z} from "zod";
import {todayKST} from "@/lib/week";
import {redirect} from "next/navigation";

type State={message:string;version:string};
export async function saveReportWorshipStaff(previous:State,form:FormData):Promise<State>{
 const {supabase,profile}=await requireActive();
 const parsed=z.object({reportId:z.uuid(),staff:z.string().trim().max(4000),version:z.string().max(100)}).safeParse(Object.fromEntries(form));
 const failed={message:"저장하지 못했습니다. 내용을 보관한 뒤 다시 확인해 주세요.",version:previous.version};
 if(!parsed.success||!isClergy(profile))return failed;
 const {reportId,staff,version}=parsed.data;
 // 날짜와 예배는 클라이언트 입력 대신 열람 가능한 보고서에서 가져온다.
 const {data:report,error}=await supabase.from("reports").select("service_type_id,meeting_date").eq("id",reportId).maybeSingle();
 if(error||!report?.service_type_id||report.meeting_date>todayKST())return failed;
 const values={staff,updated_by:profile.id};
 const result=version
  ?await supabase.from("worship_staff").update(values).eq("service_id",report.service_type_id).eq("held_on",report.meeting_date).eq("updated_at",version).select("updated_at").maybeSingle()
  :await supabase.from("worship_staff").insert({...values,service_id:report.service_type_id,held_on:report.meeting_date,created_by:profile.id}).select("updated_at").maybeSingle();
 if(result.error||!result.data)return {...failed,message:"다른 보고서에서 먼저 작성하거나 수정했을 수 있습니다. 입력 내용을 보관하고 페이지를 다시 열어 확인해 주세요."};
 return {message:"저장했습니다. 같은 날짜·예배의 다른 팀 보고서에도 함께 표시됩니다.",version:result.data.updated_at};
}

// 예배위원 보고서의 담당자 영역: 같은 공유 명단(worship_staff)을 저장하고 보고서로 돌아간다.
export async function saveStaffFromStaffReport(form:FormData){
 const {supabase,profile}=await requireActive();
 const parsed=z.object({reportId:z.uuid(),staff:z.string().trim().max(4000)}).safeParse(Object.fromEntries(form));
 if(!parsed.success)redirect("/");
 const {reportId,staff}=parsed.data;
 const back=`/reports/${reportId}`;
 if(!isClergy(profile))redirect(`${back}?staff=error#staff`);
 const {data:report,error}=await supabase.from("reports").select("service_type_id,meeting_date").eq("id",reportId).maybeSingle();
 if(error||!report?.service_type_id||report.meeting_date>todayKST())redirect(`${back}?staff=error#staff`);
 const key={service_id:report.service_type_id,held_on:report.meeting_date};
 const {data:existing}=await supabase.from("worship_staff").select("service_id").match(key).maybeSingle();
 const result=existing
  ?await supabase.from("worship_staff").update({staff,updated_by:profile.id}).match(key).select("service_id")
  :await supabase.from("worship_staff").insert({...key,staff,created_by:profile.id,updated_by:profile.id}).select("service_id");
 redirect(`${back}?staff=${result.error||!result.data?.length?"error":"saved"}#staff`);
}
