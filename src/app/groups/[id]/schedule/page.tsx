import {Suspense} from "react";
import Link from "@/components/pending-link";
import {requireActive,isSenior} from "@/lib/auth";
import {notFound,redirect} from "next/navigation";
import {Card,Field,PageTitle,Loading,inputClass,smallButtonClass} from "@/components/ui";
import {saveMeetingSchedule} from "./actions";
export default function Page(props:PageProps<"/groups/[id]/schedule">){return <Suspense fallback={<Loading/>}><Content {...props}/></Suspense>;}
const days=["일","월","화","수","목","금","토"];
async function Content({params,searchParams}:PageProps<"/groups/[id]/schedule">){
 const {supabase,profile}=await requireActive();const {id}=await params;const query=await searchParams;
 const {data:assigned}=await supabase.rpc("assigned_clergy",{gid:id});if(!isSenior(profile)&&!assigned)redirect("/groups/"+id);
 const {data:group}=await supabase.from("groups").select("name").eq("id",id).maybeSingle();if(!group)notFound();
 const {data,error}=await supabase.from("meeting_deadline_schedules").select("id,label,weekday,end_time,is_active").eq("group_id",id).order("weekday").order("end_time");if(error)throw error;
 function fields(s?:{id:string;label:string;weekday:number;end_time:string;is_active:boolean}){return <><input type="hidden" name="groupId" value={id}/>{s?<input type="hidden" name="scheduleId" value={s.id}/>:null}<Field label="모임 이름"><input name="label" defaultValue={s?.label??""} required maxLength={100} className={inputClass}/></Field><div className="grid grid-cols-2 gap-3"><Field label="요일"><select name="weekday" defaultValue={s?.weekday??0} className={inputClass}>{days.map((d,i)=><option key={d} value={i}>{d}요일</option>)}</select></Field><Field label="종료 시각 (한국 시간)"><input type="time" name="end_time" defaultValue={s?.end_time.slice(0,5)??""} required className={inputClass}/></Field></div><Field label="미제출 알림"><select name="active" defaultValue={String(s?.is_active??true)} className={inputClass}><option value="true">사용</option><option value="false">사용 안 함</option></select></Field><button className={smallButtonClass}>시간 저장</button></>;}
 return <><Link href={"/groups/"+id} className="mb-4 text-sm text-accent">← 팀 보고서</Link><PageTitle sub="종료 3시간 뒤부터 미제출 담당자와 담임 목사님·담임 사모님께 2시간마다 안내합니다. 제출하면 중단됩니다.">{group.name} · 모임 시간</PageTitle>{query.error?<p role="alert" className="mb-3 text-red-600">저장하지 못했습니다. 입력 내용과 담당 권한을 확인해 주세요.</p>:null}{query.saved?<p role="status" className="mb-3 text-accent">모임 시간을 저장했습니다.</p>:null}
 {(data??[]).map(s=><Card key={s.id} className="mb-3"><details><summary className="cursor-pointer font-semibold">{s.label} · {days[s.weekday]} {s.end_time.slice(0,5)} 종료 · {s.is_active?"사용":"중지"}</summary><form action={saveMeetingSchedule} className="mt-3 flex flex-col gap-3">{fields(s)}</form></details></Card>)}
 <Card className="mt-3"><details><summary className="cursor-pointer font-semibold">부서 모임 시간 추가</summary><p className="mt-2 text-xs text-muted">보고서의 모임 이름을 동일하게 입력해 주세요. 저장 이후 종료하는 모임부터 적용됩니다.</p><form action={saveMeetingSchedule} className="mt-3 flex flex-col gap-3">{fields()}</form></details></Card></>;
}
