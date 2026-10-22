import {AutoTranslation} from "@/components/auto-translation";
import { FeedbackReplies } from "@/components/feedback-replies";
import Link from "next/link";
import { Card, buttonClass, secondaryButtonClass, smallButtonClass, textareaClass } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { addComment, deleteComment, setReviewStatus } from "./actions";

export function ReviewPanel({
  reportId,
  status,
  canEditAsReviewer,
  editing,
}: {
  reportId: string;
  status: "submitted" | "reviewed";
  canEditAsReviewer: boolean;
  editing: boolean;
}) {
  return (
    <Card className="mb-4 flex flex-wrap items-center gap-2">
      <p className="flex-1 text-sm">
        {status === "reviewed" ? "확인 처리한 보고입니다." : "검토자로서 내용을 확인했으면 확인 처리해 주세요."}
      </p>
      {canEditAsReviewer ? (
        <Link href={editing ? `/reports/${reportId}` : `/reports/${reportId}?edit=1`} className={`${secondaryButtonClass} h-9 text-xs`}>
          {editing ? "읽기 화면으로" : "검토자 수정"}
        </Link>
      ) : null}
      <form action={setReviewStatus}>
        <input type="hidden" name="reportId" value={reportId} />
        <input type="hidden" name="reviewed" value={String(status !== "reviewed")} />
        <button type="submit" className={status === "reviewed" ? `${secondaryButtonClass} h-9 text-xs` : `${buttonClass} h-9 text-xs`}>
          {status === "reviewed" ? "확인 취소" : "확인"}
        </button>
      </form>
    </Card>
  );
}

type CommentRow = {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  author: { real_name: string | null } | null;
};

export async function Comments({ reportId, myId, isSenior, canComment }: { reportId: string; myId: string; isSenior: boolean; canComment: boolean }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("report_comments")
    .select("id, body, created_at, author_id, author:profiles(real_name)")
    .eq("report_id", reportId)
    .order("created_at")
    .returns<CommentRow[]>();
  const comments = data ?? [];

  return (
    <section id="comments" className="mt-6">
      <h2 className="mb-2 text-sm font-semibold">보고서 코멘트 {comments.length}</h2>
      <Card className="flex flex-col gap-3">
        {comments.map((c) => (
          <div key={c.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
            <div className="mb-1 flex items-center justify-between text-xs text-muted">
              <span>
                <strong className="text-foreground">{c.author?.real_name}</strong>{" "}
                {new Date(c.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
              {(canComment && c.author_id === myId) || isSenior ? (
                <form action={deleteComment}>
                  <input type="hidden" name="reportId" value={reportId} />
                  <input type="hidden" name="commentId" value={c.id} />
                  <button type="submit" className="text-xs underline underline-offset-2">
                    삭제
                  </button>
                </form>
              ) : null}
            </div>
            <AutoTranslation kind="comment" id={c.id} source={c.body} senior={isSenior}/><p className="whitespace-pre-wrap break-words text-sm">{c.body}</p><FeedbackReplies kind="report" commentId={c.id}/>
          </div>
        ))}
        {canComment ? <form action={addComment} className="flex flex-col gap-2">
          <input type="hidden" name="reportId" value={reportId} />
          <textarea name="body" required maxLength={1000} rows={2} placeholder="보고서에 대한 코멘트를 바로 남겨 주세요." className={textareaClass} />
          <button type="submit" className={`${smallButtonClass} self-end`}>
            코멘트 등록
          </button>
        </form> : <p className="text-xs text-muted">담임 목사님·담임 사모님과 교역자가 남긴 피드백을 확인하실 수 있습니다.</p>}
      </Card>
    </section>
  );
}
