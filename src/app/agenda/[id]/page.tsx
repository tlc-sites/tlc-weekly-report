import {Suspense} from "react";
import Link from "@/components/pending-link";
import {notFound} from "next/navigation";
import {requireActive,isSenior} from "@/lib/auth";
import {groupDisplayName} from "@/lib/group-display";
import {SubmitButton} from "@/components/submit-button";
import {Badge,Card,Loading,PageTitle,textareaClass,smallButtonClass,secondaryButtonClass} from "@/components/ui";
import {replyAgenda,setAgendaStatus,deleteAgenda,deleteAgendaReply} from "../actions";

export default function Page(props:PageProps<"/agenda/[id]">){return <Suspense fallback={<Loading/>}><Content {...props}/></Suspense>;}

const when=(t:string)=>new Date(t).toLocaleString("ko-KR",{timeZone:"Asia/Seoul",month:"numeric",day:"numeric",weekday:"short",hour:"numeric",minute:"2-digit"});
const MESSAGES:Record<string,string>={save:"답글을 저장하지 못했습니다. 다시 시도해 주세요.",status:"상태를 바꾸지 못했습니다.",delete:"지우지 못했습니다. 직접 쓴 글만 지울 수 있습니다.",invalid:"내용을 확인해 주세요."};

async function Content({params,searchParams}:PageProps<"/agenda/[id]">){
 const {supabase,profile}=await requireActive();const {id}=await params;const query=await searchParams;
 if(!/^[0-9a-f-]{36}$/i.test(id))notFound();
 const [{data:a,error},{data:replies,error:replyError}]=await Promise.all([
  supabase.from("agenda_items").select("id,title,body,status,done_at,created_at,author_id,group:groups(name),author:profiles!agenda_items_author_id_fkey(real_name)").eq("id",id).maybeSingle(),
  supabase.from("agenda_replies").select("id,body,created_at,author_id,author:profiles(real_name,recipient_role,is_minister)").eq("agenda_id",id).order("created_at"),
 ]);
 if(error)throw error;if(replyError)throw replyError;if(!a)notFound();
 const senior=isSenior(profile);
 const group=(a.group as unknown as {name:string}|null)?.name;
 const author=(a.author as unknown as {real_name:string}|null)?.real_name;
 const msg=typeof query.error==="string"?MESSAGES[query.error]:undefined;
 return <>
  <Link href="/agenda" className="mb-4 text-sm text-accent">← 부서 안건</Link>
  <PageTitle sub={<span className="flex flex-wrap items-center gap-2"><Badge tone="accent">{group?groupDisplayName(group):"부서"}</Badge>{a.status==="done"?<Badge>완료</Badge>:<Badge tone="danger">진행 중</Badge>}<span>{author??"작성자"} · {when(a.created_at)}</span></span>}>{a.title}</PageTitle>
  {msg?<p role="alert" className="mb-3 text-red-600">{msg}</p>:null}
  {query.created?<p role="status" className="mb-3 text-accent">안건을 올렸습니다. 그 부서 총괄·부장·팀장과 담당 교역자에게 알림이 갑니다.</p>:null}
  {query.sent?<p role="status" className="mb-3 text-accent">답글을 남겼습니다.</p>:null}
  <Card className="mb-4"><p className="whitespace-pre-wrap text-[15px] leading-relaxed">{a.body}</p></Card>
  {senior?<div className="mb-6 flex flex-wrap gap-2">
   <form action={setAgendaStatus}><input type="hidden" name="agendaId" value={a.id}/><input type="hidden" name="done" value={a.status==="done"?"0":"1"}/><SubmitButton className={smallButtonClass} pendingText="바꾸는 중…">{a.status==="done"?"다시 진행 중으로":"완료로 표시"}</SubmitButton></form>
   {a.author_id===profile.id?<details className="text-sm"><summary className={secondaryButtonClass+" cursor-pointer list-none"}>안건 지우기</summary><form action={deleteAgenda} className="mt-2 flex items-center gap-2"><input type="hidden" name="agendaId" value={a.id}/><span className="text-muted">답글과 알림도 함께 지워지고 되돌릴 수 없습니다.</span><SubmitButton className={smallButtonClass} pendingText="지우는 중…">정말 지우기</SubmitButton></form></details>:null}
  </div>:null}
  <h2 className="mb-2 font-semibold">답글 {replies?.length??0}개</h2>
  {(replies??[]).map(r=>{const who=r.author as unknown as {real_name:string;recipient_role:string|null;is_minister:boolean}|null;
   return <Card key={r.id} className="mb-3"><div id={"reply-"+r.id} className="scroll-mt-20"><p className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted"><b className="text-sm text-foreground">{who?.real_name??"작성자"}</b>{who?.recipient_role?<Badge tone="accent">{who.recipient_role==="pastor"?"담임 목사":"담임 사모"}</Badge>:who?.is_minister?<Badge>교역자</Badge>:null}<span>{when(r.created_at)}</span>
    {r.author_id===profile.id?<form action={deleteAgendaReply} className="ml-auto"><input type="hidden" name="agendaId" value={a.id}/><input type="hidden" name="replyId" value={r.id}/><button type="submit" className="text-xs text-muted underline">지우기</button></form>:null}</p>
    <p className="whitespace-pre-wrap text-sm">{r.body}</p></div></Card>;})}
  <form action={replyAgenda} className="mt-4 flex flex-col gap-3"><input type="hidden" name="agendaId" value={a.id}/>
   <label htmlFor="agenda-reply" className="font-semibold">답글 쓰기</label>
   <textarea id="agenda-reply" name="body" required rows={4} className={textareaClass} placeholder={senior?"부서와 나눌 말씀을 적어 주세요.":"의견이나 진행 상황을 적어 주세요."}/>
   <SubmitButton className={smallButtonClass} pendingText="보내는 중…">답글 남기기</SubmitButton>
  </form>
 </>;
}
