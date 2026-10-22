import {requireActive,isClergy} from "@/lib/auth";
import {Card} from "./ui";
import {ReportWorshipStaffEditor} from "./report-worship-staff-editor";

export async function SharedWorshipStaff({reportId,serviceId,date}:{reportId:string;serviceId:string|null;date:string}){
 if(!serviceId)return null;
 const {supabase,profile}=await requireActive();
 const {data,error}=await supabase.from("worship_staff").select("staff,updated_at").eq("service_id",serviceId).eq("held_on",date).maybeSingle();
 if(error)throw error;
 return <Card className="mb-4"><h2 className="font-semibold">예배위원</h2>
  <p className="mt-2 text-xs text-muted">한 팀에서 등록하면 같은 날짜·예배의 모든 팀 보고서에 함께 표시됩니다.</p>
  {isClergy(profile)?<ReportWorshipStaffEditor reportId={reportId} staff={data?.staff??""} version={data?.updated_at??""}/>:<p className="mt-3 whitespace-pre-wrap break-words text-sm">{data?.staff||"아직 등록된 예배위원이 없습니다."}</p>}
 </Card>;
}
