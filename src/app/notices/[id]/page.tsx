import {FeedbackEdit} from "@/components/feedback-edit";
import {FeedbackReplies} from "@/components/feedback-replies";
import {loadFeedbackReplies} from "@/lib/feedback-replies";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { BackLink, Card, Loading, PageTitle, textareaClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireActive } from "@/lib/auth";
import { addNoticeComment } from "../actions";

export default function NoticePage(props: PageProps<"/notices/[id]">) {
  return <Suspense fallback={<Loading />}><Content {...props} /></Suspense>;
}
async function Content({ params, searchParams }: PageProps<"/notices/[id]">) {
  const { supabase,profile } = await requireActive();
  const [{ id }, { saved, commented, error, push }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [{ data: notice, error: loadError }, comments] = await Promise.all([
    supabase.from("notices").select("id,title,body,created_at").eq("id",id).maybeSingle(),
    supabase.from("notice_comments").select("id,body,created_at,author_id").eq("notice_id",id).order("created_at"),
  ]);
  if (loadError) throw loadError;
  if (!notice) notFound();
  if (comments.error) throw comments.error;
 const replies=await loadFeedbackReplies(supabase,"notice",(comments.data??[]).map(c=>c.id));
  // 이름 열람도 기존 프로필 RLS를 거친다. 보이지 않는 이름은 역할을 추정하지 않는다.
  const authors = [...new Set((comments.data ?? []).map(c => c.author_id))];
  const profiles = authors.length ? await supabase.from("profiles").select("id,real_name").in("id",authors) : { data: [] };
  return <>
    <BackLink href="/notices">공지·소통</BackLink><PageTitle>{notice.title}</PageTitle>
    {saved || commented ? <p role="status" className="mb-4 rounded-lg bg-accent/10 p-3 text-sm text-accent">{saved ? "공지를 등록했습니다." : "댓글을 등록했습니다."}</p> : null}
    {push ? <p role="status" className="mb-3 text-sm text-muted">앱에는 등록됐지만 일부 푸시를 보내지 못했습니다.</p> : null}
    {error ? <p role="alert" className="mb-3 text-sm text-danger">댓글을 저장하지 못했습니다.</p> : null}
    <Card className="mb-6"><p className="mb-3 text-xs text-muted">{new Date(notice.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p><p className="whitespace-pre-wrap">{notice.body}</p></Card>
    <h2 id="comments" className="mb-2 font-semibold">댓글 {comments.data?.length ?? 0}개</h2>
    <Card><ul className="divide-y divide-border">{(comments.data ?? []).map(c => <li key={c.id} className="py-3">
      <p className="mb-1 text-xs text-muted">{profiles.data?.find(p => p.id === c.author_id)?.real_name ?? "구성원"} · {new Date(c.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p><p className="whitespace-pre-wrap text-sm">{c.body}</p>{c.author_id===profile.id?<FeedbackEdit kind="notice" id={c.id} body={c.body}/>:null}<FeedbackReplies kind="notice" commentId={c.id} items={replies} myId={profile.id}/>
    </li>)}</ul>
    <form action={addNoticeComment} className="mt-4 flex flex-col gap-3"><input type="hidden" name="noticeId" value={id} />
      <label className="flex flex-col gap-2 text-sm">댓글 작성<textarea name="body" required rows={3} maxLength={1000} className={textareaClass} /></label>
      <SubmitButton pendingText="댓글 등록 중…">댓글 등록</SubmitButton>
    </form></Card>
  </>;
}
