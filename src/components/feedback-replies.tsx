import {SubmitButton} from "@/components/submit-button";
import type {FeedbackReply,ReplyKind} from "@/lib/feedback-replies";
import {addFeedbackReply} from "@/app/notifications/actions";
import {textareaClass,smallButtonClass} from "./ui";
export function FeedbackReplies({kind,commentId,items}:{kind:ReplyKind;commentId:string;items:FeedbackReply[]}){
 const data=items.filter(r=>r.comment_id===commentId);
 return <div className="mt-3 ml-3 border-l-2 border-border pl-3"><ul>{(data??[]).map(r=><li key={r.id} className="mb-3"><p className="text-xs text-muted">{(r.author as unknown as {real_name:string}|null)?.real_name??"작성자"} · {new Date(r.created_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}</p><p className="whitespace-pre-wrap break-words text-sm">{r.body}</p></li>)}</ul><details><summary className="cursor-pointer text-xs text-accent">답글 달기</summary><form action={addFeedbackReply} className="mt-2 flex flex-col gap-2"><input type="hidden" name="kind" value={kind}/><input type="hidden" name="commentId" value={commentId}/><textarea name="body" aria-label="코멘트 답글" required maxLength={1000} rows={2} className={textareaClass}/><SubmitButton className={`${smallButtonClass} self-end`} pendingText="등록 중…">답글 등록</SubmitButton></form></details></div>;
}
