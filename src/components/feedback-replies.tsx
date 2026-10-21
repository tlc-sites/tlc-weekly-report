import {createClient} from "@/lib/supabase/server";
import {addFeedbackReply} from "@/app/notifications/actions";
import {textareaClass,smallButtonClass} from "./ui";
export async function FeedbackReplies({kind,commentId}:{kind:"report"|"incident";commentId:string}){
 const supabase=await createClient();const {data,error}=await supabase.from(`${kind}_comment_replies`).select("id,body,created_at,author:profiles(real_name)").eq("comment_id",commentId).order("created_at");if(error)throw error;
 return <div className="mt-3 ml-3 border-l-2 border-border pl-3"><ul>{(data??[]).map(r=><li key={r.id} className="mb-3"><p className="text-xs text-muted">{(r.author as unknown as {real_name:string}|null)?.real_name??"작성자"} · {new Date(r.created_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}</p><p className="whitespace-pre-wrap text-sm">{r.body}</p></li>)}</ul><details><summary className="cursor-pointer text-xs text-accent">답글 달기</summary><form action={addFeedbackReply} className="mt-2 flex flex-col gap-2"><input type="hidden" name="kind" value={kind}/><input type="hidden" name="commentId" value={commentId}/><textarea name="body" aria-label="피드백 답글" required maxLength={1000} rows={2} className={textareaClass}/><button className={`${smallButtonClass} self-end`}>답글 등록</button></form></details></div>;
}
