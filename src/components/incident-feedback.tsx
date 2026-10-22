import {FeedbackEdit} from "@/components/feedback-edit";
import {SubmitButton} from "@/components/submit-button";
import {loadFeedbackReplies} from "@/lib/feedback-replies";
import { FeedbackReplies } from "@/components/feedback-replies";
import { requireActive, isClergy, isSenior } from "@/lib/auth";
import { Card, textareaClass, smallButtonClass } from "./ui";
import { addIncidentFeedback, deleteIncidentFeedback } from "@/app/incidents/feedback-actions";

export async function IncidentFeedback({ incidentId }: { incidentId: string }) {
  const {supabase,profile}=await requireActive();
  const {data,error}=await supabase.from("incident_comments").select("id,body,author_id,created_at,author:profiles(real_name)").eq("incident_id",incidentId).order("created_at");
  if(error) throw error;
 const replies=await loadFeedbackReplies(supabase,"incident",(data??[]).map(c=>c.id));
  return <section id="comments" className="mt-4"><h3 className="mb-2 text-sm font-semibold">담임목사님, 담임사모님 코멘트</h3><Card className="flex flex-col gap-3">
    {(data ?? []).map(c=><div key={c.id} className="border-b border-border pb-3">
      <div className="flex items-center justify-between gap-2 text-xs text-muted"><span>{(c.author as unknown as {real_name:string|null}|null)?.real_name ?? "교역자"} · {new Date(c.created_at).toLocaleDateString("ko-KR",{timeZone:"Asia/Seoul"})}</span>
        {isSenior(profile) || (isClergy(profile) && c.author_id===profile.id) ? <form action={deleteIncidentFeedback}><input type="hidden" name="incidentId" value={incidentId}/><input type="hidden" name="commentId" value={c.id}/><button className="underline">삭제</button></form>:null}
      </div><p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>{c.author_id===profile.id?<FeedbackEdit kind="incident" id={c.id} body={c.body}/>:null}<FeedbackReplies kind="incident" commentId={c.id} items={replies} myId={profile.id}/>
    </div>)}
    {isClergy(profile) ? <form action={addIncidentFeedback} className="flex flex-col gap-2"><input type="hidden" name="incidentId" value={incidentId}/><textarea name="body" required maxLength={1000} rows={2} placeholder="이 이슈에 대한 피드백을 남겨 주세요." className={textareaClass}/><SubmitButton className={`${smallButtonClass} self-end`} pendingText="등록 중…">피드백 등록</SubmitButton></form>:<p className="text-xs text-muted">교역자가 남긴 피드백을 확인하실 수 있습니다.</p>}
  </Card></section>;
}
