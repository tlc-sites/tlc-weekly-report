import {requireActive} from "@/lib/auth";
import {Card} from "./ui";
import Link from "./pending-link";

export async function SharedWorshipStaff({serviceId,date}:{serviceId:string|null;date:string}){
 if(!serviceId)return null;
 const {supabase}=await requireActive();
 const {data,error}=await supabase.from("worship_staff").select("staff,updated_at").eq("service_id",serviceId).eq("held_on",date).maybeSingle();
 if(error)throw error;
 return <Card className="mb-4"><h2 className="font-semibold">예배위원</h2>
  <p className="mt-2 text-xs text-muted">같은 날짜·예배에 등록된 공통 명단입니다. 예배위원 등록 여부와 관계없이 보고서를 제출할 수 있습니다.</p>
  <p className="mt-3 whitespace-pre-wrap break-words text-sm">{data?.staff||"아직 등록된 예배위원이 없습니다."}</p>
  <Link href={`/worship-staff?date=${date}#service-${serviceId}`} className="mt-3 inline-block text-sm font-semibold text-accent underline">예배위원 메뉴에서 보기</Link>
 </Card>;
}
