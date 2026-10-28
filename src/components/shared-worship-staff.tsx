import {requireActive} from "@/lib/auth";
import {saveStaffFromStaffReport} from "@/app/reports/[id]/worship-staff-actions";
import {Card} from "./ui";
import Link from "./pending-link";
import {WorshipStaffFields} from "./worship-staff-fields";

// staffReport: 예배위원 보고서에서는 이 명단이 보고서의 담당자 영역이 되어 바로 고칠 수 있다.
export async function SharedWorshipStaff({serviceId,date,staffReport,status}:{serviceId:string|null;date:string;staffReport?:{reportId:string;editable:boolean};status?:string}){
 if(!serviceId)return null;
 const {supabase}=await requireActive();
 const {data,error}=await supabase.from("worship_staff").select("staff,updated_at").eq("service_id",serviceId).eq("held_on",date).maybeSingle();
 if(error)throw error;
 if(staffReport)return <Card className="mb-4"><h2 id="staff" className="scroll-mt-6 font-semibold">예배위원 담당자</h2>
  <p className="mt-2 text-xs text-muted">이 예배·날짜의 공통 명단입니다. 여기서 저장하면 예배위원 메뉴와 다른 팀 보고서에도 같이 보입니다.</p>
  {status==="saved"?<p role="status" className="mt-2 text-sm text-accent">예배위원 명단을 저장했습니다.</p>:null}
  {status==="error"?<p role="alert" className="mt-2 text-sm text-danger">명단을 저장하지 못했습니다. 교역자 권한과 예배 날짜를 확인해 주세요.</p>:null}
  {staffReport.editable?<form action={saveStaffFromStaffReport} className="mt-3 flex flex-col gap-3"><input type="hidden" name="reportId" value={staffReport.reportId}/><WorshipStaffFields key={data?.updated_at??"new"} initial={data?.staff??""}/></form>
   :<p className="mt-3 whitespace-pre-wrap break-words text-sm">{data?.staff||"아직 등록된 예배위원이 없습니다."}</p>}
 </Card>;
 return <Card className="mb-4"><h2 className="font-semibold">예배위원</h2>
  <p className="mt-2 text-xs text-muted">같은 날짜·예배에 등록된 공통 명단입니다. 예배위원 등록 여부와 관계없이 보고서를 제출할 수 있습니다.</p>
  <p className="mt-3 whitespace-pre-wrap break-words text-sm">{data?.staff||"아직 등록된 예배위원이 없습니다."}</p>
  <Link href={`/worship-staff?date=${date}#service-${serviceId}`} className="mt-3 inline-block text-sm font-semibold text-accent underline">예배위원 메뉴에서 보기</Link>
 </Card>;
}
