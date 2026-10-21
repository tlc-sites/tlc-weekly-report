import {Suspense} from "react";
import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {requireActive} from "@/lib/auth";
import {todayKST,isIsoDate} from "@/lib/week";
import {Card,Loading,PageTitle,inputClass,smallButtonClass} from "@/components/ui";
import {addParticipant,setParticipantActive,saveAttendance} from "./actions";
const labels={present:"출석",late:"지각",absent:"결석",excused:"사유 결석"};
export default function Page(props:PageProps<"/groups/[id]/attendance">){return <Suspense fallback={<Loading/>}><Content {...props}/></Suspense>;}
async function Content({params,searchParams}:PageProps<"/groups/[id]/attendance">){
 const {supabase}=await requireActive();const {id}=await params;const query=await searchParams;
 const {data:allowed}=await supabase.rpc("can_manage_internship",{gid:id});if(!allowed)redirect("/groups/"+id);
 const {data:group}=await supabase.from("groups").select("name,parent:parent_id(name)").eq("id",id).maybeSingle();if(!group)notFound();
 const day=typeof query.date==="string"&&isIsoDate(query.date)&&query.date<=todayKST()?query.date:todayKST();
 const [{data:people,error},{data:attendance,error:attendanceError},{data:history}]=await Promise.all([
 supabase.from("internship_participants").select("id,name,is_active").eq("group_id",id).order("created_at"),
 supabase.from("internship_attendance").select("participant_id,participant_name,mark,note").eq("group_id",id).eq("held_on",day),
 supabase.from("internship_attendance").select("held_on").eq("group_id",id).order("held_on",{ascending:false}).limit(1000)]);
 if(error||attendanceError)throw error??attendanceError;
 const active=(people??[]).filter(p=>p.is_active),byId=new Map((attendance??[]).map(a=>[a.participant_id,a]));
 const dates=[...new Set((history??[]).map(r=>r.held_on))];
 return <><Link href={"/groups/"+id} className="mb-4 text-sm text-accent">← 반 보고서</Link><PageTitle sub="참여자를 추가한 뒤 모임 날짜별 출결을 기록해 주세요. 참여자 등록으로 로그인 권한은 생기지 않습니다.">스데반 {group.name} · 출결</PageTitle>
 {query.error?<p role="alert" className="mb-3 text-red-600">저장하지 못했습니다. 명단이 바뀌었거나 출결을 빠뜨렸을 수 있습니다. 새로고침 후 확인해 주세요.</p>:null}{query.saved?<p role="status" className="mb-3 text-accent">출결을 저장했습니다.</p>:null}
 <Card className="mb-4"><form action={addParticipant} className="flex flex-wrap gap-2"><input type="hidden" name="groupId" value={id}/><input name="name" aria-label="참여자 이름" required maxLength={100} placeholder="참여자 이름" className={inputClass}/><button className={smallButtonClass}>참여자 추가</button></form></Card>
 <form method="get" className="mb-4 flex items-end gap-2"><label className="flex-1 text-sm">모임 날짜<input type="date" name="date" defaultValue={day} max={todayKST()} required className={inputClass}/></label><button className={smallButtonClass}>날짜 조회</button></form>
 <p className="mb-3 text-sm text-muted">활동 참여자 {active.length}명 · {day} 저장된 출결 {(attendance??[]).length}명</p>
 {active.length?<form action={saveAttendance} className="mb-5 flex flex-col gap-3"><input type="hidden" name="groupId" value={id}/><input type="hidden" name="date" value={day}/>{active.map(p=><Card key={p.id}><label className="mb-2 block font-semibold" htmlFor={"mark:"+p.id}>{p.name}</label><select id={"mark:"+p.id} name={"mark:"+p.id} required defaultValue={byId.get(p.id)?.mark??""} className={inputClass}><option value="" disabled>출결을 선택해 주세요</option>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><input name={"note:"+p.id} aria-label={p.name+" 출결 메모"} maxLength={500} defaultValue={byId.get(p.id)?.note??""} placeholder="메모 (선택)" className={"mt-2 "+inputClass}/></Card>)}<button className={smallButtonClass}>출결 저장</button></form>:<p className="mb-4 text-sm text-muted">먼저 참여자를 등록해 주세요.</p>}
 {(attendance??[]).some(a=>!active.some(p=>p.id===a.participant_id))?<Card className="mb-4"><h2 className="font-semibold">이전 참여자의 출결 기록</h2>{(attendance??[]).filter(a=>!active.some(p=>p.id===a.participant_id)).map(a=><p key={a.participant_id} className="text-sm">{a.participant_name} · {labels[a.mark as keyof typeof labels]} {a.note}</p>)}</Card>:null}
 <details className="mb-4"><summary className="cursor-pointer font-semibold">참여자 명단 관리</summary><ul className="divide-y divide-border">{(people??[]).map(p=><li key={p.id} className="flex items-center justify-between gap-2 py-3"><span>{p.name} · {p.is_active?"활동 중":"활동 종료"}</span><form action={setParticipantActive}><input type="hidden" name="groupId" value={id}/><input type="hidden" name="participantId" value={p.id}/><input type="hidden" name="active" value={String(!p.is_active)}/><button className="text-sm text-accent underline">{p.is_active?"활동 종료":"다시 추가"}</button></form></li>)}</ul></details>
 {dates.length?<details><summary className="cursor-pointer font-semibold">저장된 날짜</summary><div className="mt-2 flex flex-wrap gap-3">{dates.map(d=><Link key={d} href={"?date="+d} className="text-sm text-accent underline">{d}</Link>)}</div></details>:null}</>;
}
