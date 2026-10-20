import { requireActive } from "@/lib/auth";
import { Card, smallButtonClass, selectClass } from "./ui";
import { changeIncidentShare } from "@/app/incidents/feedback-actions";

export async function IncidentSharing({incidentId}:{incidentId:string}) {
  const {supabase}=await requireActive();
  const {data:canShare}=await supabase.rpc("can_share_incident",{iid:incidentId});
  if(!canShare) return null;
  const [people,shares]=await Promise.all([
    supabase.from("profiles").select("id,real_name").eq("status","active").eq("is_minister",true).order("real_name"),
    supabase.from("incident_shares").select("minister_id").eq("incident_id",incidentId),
  ]);
  if(people.error || shares.error) throw new Error("공개 설정을 불러오지 못했습니다.");
  return <details className="mt-4"><summary className="cursor-pointer text-sm text-accent">다른 교역자에게 이 이슈 공개</summary><Card className="mt-2">
    <form action={changeIncidentShare} className="flex flex-col gap-2"><input type="hidden" name="incidentId" value={incidentId}/><select name="ministerId" required className={selectClass}><option value="">교역자를 선택해 주세요</option>{people.data?.map(p=><option key={p.id} value={p.id}>{p.real_name}</option>)}</select><button name="operation" value="grant" className={smallButtonClass}>이 이슈 공개</button></form>
    {shares.data?.map(s=><form action={changeIncidentShare} key={s.minister_id} className="mt-3 flex justify-between gap-3 text-sm"><input type="hidden" name="incidentId" value={incidentId}/><input type="hidden" name="ministerId" value={s.minister_id}/><span>{people.data?.find(p=>p.id===s.minister_id)?.real_name ?? "비활성 교역자"}</span><button name="operation" value="revoke" className="underline">공개 취소</button></form>)}
  </Card></details>;
}
