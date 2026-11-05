import {Suspense} from "react";
import Link from "@/components/pending-link";
import {requireActive,isClergy} from "@/lib/auth";
import {addDays,formatDate,todayKST} from "@/lib/week";
import {upcomingSunday} from "@/lib/sunday-notice";
import {BackLink,Card,Loading,PageTitle,smallButtonClass,textareaClass} from "@/components/ui";
import {SubmitButton} from "@/components/submit-button";
import {saveSundayNotice,deleteSundayNotice} from "./actions";

export default function Page(props:PageProps<"/sunday-notice">){return <Suspense fallback={<Loading/>}><Content {...props}/></Suspense>;}

// 이번 주(돌아오는 주일) 공지: 교역자·관리자가 쓰면 모든 사람이 첫 화면에서 팝업으로 본다.
async function Content({searchParams}:PageProps<"/sunday-notice">){
 const {supabase,profile}=await requireActive();
 const q=await searchParams;
 const today=todayKST(),next=upcomingSunday(today);
 const choices=[0,1,2,3].map(i=>addDays(next,i*7));
 const sunday=typeof q.sunday==="string"&&choices.includes(q.sunday)?q.sunday:next;
 const canWrite=isClergy(profile)||profile.is_admin;
 const [{data:current},{data:recent}]=await Promise.all([
  supabase.from("sunday_notices").select("sunday,body,updated_at,editor:profiles!sunday_notices_updated_by_fkey(real_name)").eq("sunday",sunday).maybeSingle(),
  supabase.from("sunday_notices").select("sunday,body").lt("sunday",next).order("sunday",{ascending:false}).limit(5),
 ]);
 const editor=(current?.editor as unknown as {real_name:string|null}|null)?.real_name;
 return <><BackLink href="/">홈</BackLink>
  <PageTitle sub={canWrite?"적어 두면 그 주일까지 모든 사람의 첫 화면에 팝업으로 한 번 보입니다. 예) 이번 주 영상 광고 없습니다 / 성찬 주일입니다":"돌아오는 주일에 알아 두실 내용입니다."}>이번 주 공지</PageTitle>
  {q.saved?<p role="status" className="mb-3 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">저장했습니다. 첫 화면 팝업에 바로 반영됩니다.</p>:null}
  {q.deleted?<p role="status" className="mb-3 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">삭제했습니다.</p>:null}
  {q.error?<p role="alert" className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">처리하지 못했습니다. 교역자·관리자 권한과 날짜를 확인해 주세요.</p>:null}
  {canWrite?<nav aria-label="주일 고르기" className="week-nav mb-4 flex flex-wrap gap-2">{choices.map((d,i)=><Link key={d} href={`/sunday-notice?sunday=${d}`} aria-current={d===sunday?"page":undefined} className={smallButtonClass+(d===sunday?" border-accent text-accent font-semibold":"")}>{formatDate(d)}{i===0?" (돌아오는 주일)":""}</Link>)}</nav>:null}
  <Card className="mb-6">
   <h2 className="mb-2 font-semibold">{formatDate(sunday)} 주일</h2>
   {canWrite?<form action={saveSundayNotice} className="flex flex-col gap-3">
    <input type="hidden" name="sunday" value={sunday}/>
    <textarea name="body" required maxLength={1000} rows={5} defaultValue={current?.body??""} key={sunday} className={textareaClass} placeholder={"예)\n· 이번 주는 성찬 주일입니다.\n· 이번 주 영상 광고 없습니다."}/>
    <div className="flex flex-wrap items-center gap-2"><SubmitButton pendingText="저장 중…">{current?"고쳐서 저장":"저장하고 모두에게 보이기"}</SubmitButton>
     {current?<span className="text-xs text-muted">마지막 수정 {editor??"교역자"} · {new Date(current.updated_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul",month:"numeric",day:"numeric",hour:"numeric",minute:"2-digit"})}</span>:null}</div>
   </form>:<p className="whitespace-pre-wrap text-sm">{current?.body??"아직 등록된 공지가 없습니다."}</p>}
   {canWrite&&current?<form action={deleteSundayNotice} className="mt-3"><input type="hidden" name="sunday" value={sunday}/><button className="text-xs text-muted underline hover:text-danger">이 주일 공지 삭제</button></form>:null}
  </Card>
  {recent?.length?<><h2 className="mb-2 text-sm font-semibold text-muted">지난 공지</h2><ul className="flex flex-col gap-2">{recent.map(r=><li key={r.sunday} className="rounded-xl border border-border bg-surface px-4 py-3 text-sm"><b className="mr-2">{formatDate(r.sunday)}</b><span className="whitespace-pre-wrap text-muted">{r.body}</span></li>)}</ul></>:null}
 </>;
}
