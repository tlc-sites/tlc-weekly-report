import {z} from "zod";
import {Suspense} from "react";
import Link from "@/components/pending-link";
import {notFound} from "next/navigation";
import {requireActive} from "@/lib/auth";
import {getGroupAccess} from "@/lib/access";
import {todayKST,addDays} from "@/lib/week";
import {rehearsalTotals,type RehearsalMark} from "@/lib/rehearsals";
import {BackLink,Card,Field,Loading,PageTitle,ErrorText,inputClass,selectClass,smallButtonClass,buttonClass} from "@/components/ui";
import {saveRehearsal} from "./actions";
export default function Page(props:PageProps<"/groups/[id]/rehearsals">){return <Suspense fallback={<Loading/>}><Content {...props}/></Suspense>;}
async function Content({params,searchParams}:PageProps<"/groups/[id]/rehearsals">){
  const {supabase}=await requireActive();const {id}=await params;const p=await searchParams;
  const {group}=await getGroupAccess(supabase,id);if(group.type!=="worship")notFound();
  const scope=await supabase.rpc("can_view_roster",{gid:id});if(!scope.data)notFound();
  const today=todayKST(),valid=(v:unknown)=>typeof v==="string"&&z.iso.date().safeParse(v).success&&v<=today;
  const from=valid(p.from)?String(p.from):addDays(today,-56),to=valid(p.to)&&String(p.to)>=from?String(p.to):today,date=valid(p.date)?String(p.date):today;
  const [people,sessions,selectedSessions,manage]=await Promise.all([supabase.from("members").select("id,name,status").eq("group_id",id).order("name"),supabase.from("rehearsals").select("id,held_on,title").eq("group_id",id).gte("held_on",from).lte("held_on",to).order("created_at",{ascending:false}),supabase.from("rehearsals").select("id,held_on,title").eq("group_id",id).eq("held_on",date).order("created_at",{ascending:false}),supabase.rpc("can_manage_rehearsal",{gid:id})]);
  if(people.error||sessions.error||selectedSessions.error)throw new Error("리허설 기록을 불러오지 못했습니다.");
  const sessionIds=(sessions.data??[]).map(s=>s.id);const recordIds=[...new Set([...sessionIds,...(selectedSessions.data??[]).map(s=>s.id)])];const marks=recordIds.length?await supabase.from("rehearsal_attendance").select("rehearsal_id,member_id,status,note").in("rehearsal_id",recordIds):{data:[],error:null};if(marks.error)throw marks.error;
  const current=(selectedSessions.data??[]).find(s=>s.id===p.session) ?? selectedSessions.data?.[0];const currentMarks=new Map((marks.data??[]).filter(m=>m.rehearsal_id===current?.id).map(m=>[m.member_id,m]));
  const totals=rehearsalTotals(people.data??[],(marks.data??[]).filter(m=>sessionIds.includes(m.rehearsal_id)) as RehearsalMark[],p.sort==="name"?"name":"absent");
  return <><BackLink href={`/groups/${id}`}>{group.name} 보고</BackLink><PageTitle sub="미기록은 불참으로 세지 않습니다. 전체 불참에 사유 있는 불참을 포함하고, 사유 있는 횟수도 따로 표시합니다.">리허설 참석 관리</PageTitle><Link href={`/groups/${id}/members`} className={`${smallButtonClass} mb-4`}>팀원 명단 관리</Link>
    <form method="get" className="mb-4 grid grid-cols-2 gap-3"><Field label="집계 시작"><input type="date" name="from" defaultValue={from} max={today} className={inputClass}/></Field><Field label="집계 끝"><input type="date" name="to" defaultValue={to} max={today} className={inputClass}/></Field><Field label="정렬"><select name="sort" defaultValue={p.sort==="name"?"name":"absent"} className={selectClass}><option value="absent">불참 횟수 많은 순</option><option value="name">이름순</option></select></Field><Field label="기록할 날짜"><input type="date" name="date" max={today} defaultValue={date} className={inputClass}/></Field>{(selectedSessions.data?.length??0)>1?<Field label="기록할 리허설"><select name="session" defaultValue={current?.id} className={selectClass}>{selectedSessions.data?.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></Field>:null}<button className={`${smallButtonClass} col-span-2`}>조회</button></form>
    {p.error?<ErrorText>{p.error==="invalid"?"모든 팀원의 참석 여부를 선택해 주세요.":"저장하지 못했습니다."}</ErrorText>:null}{p.saved?<p role="status" className="mb-3 text-accent">저장했습니다.</p>:null}
    <Card className="mb-5"><h2 className="mb-3 font-semibold">기간별 참석 현황</h2><table className="w-full text-sm"><thead><tr><th className="text-left">이름</th><th>참석</th><th>불참</th><th>사유 있음</th></tr></thead><tbody>{totals.map(m=><tr key={m.id} className="border-t border-border"><td className="py-3">{m.name}</td><td className="text-center">{m.attended}</td><td className="text-center font-semibold text-danger">{m.absent+m.excused}</td><td className="text-center">{m.excused}</td></tr>)}</tbody></table></Card>
    {manage.data?<Card><h2 className="mb-3 font-semibold">{date} 참석 기록</h2><form action={saveRehearsal} className="flex flex-col gap-3"><input type="hidden" name="groupId" value={id}/><input type="hidden" name="heldOn" value={date}/><Field label="리허설 이름"><input name="title" required maxLength={100} defaultValue={current?.title??"예배 리허설"} className={inputClass}/></Field>{(people.data??[]).filter(m=>m.status!=="inactive").map(m=><div key={m.id} className="rounded-xl border border-border p-3"><input type="hidden" name="memberId" value={m.id}/><Field label={m.name}><select required name={`status:${m.id}`} defaultValue={currentMarks.get(m.id)?.status??""} className={selectClass}><option value="">선택해 주세요</option><option value="attended">참석</option><option value="absent">불참</option><option value="excused">사유 있는 불참</option></select></Field><input name={`note:${m.id}`} maxLength={200} defaultValue={currentMarks.get(m.id)?.note??""} placeholder="필요한 메모" className={`${inputClass} mt-2`}/></div>)}<button disabled={!people.data?.some(m=>m.status!=="inactive")} className={buttonClass}>참석 기록 저장</button></form></Card>:null}
  </>;
}
