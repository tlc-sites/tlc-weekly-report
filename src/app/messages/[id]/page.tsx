import {SubmitButton} from "@/components/submit-button";
import {Suspense} from "react";
import Link from "@/components/pending-link";
import {requireActive} from "@/lib/auth";
import {notFound} from "next/navigation";
import {Card,Loading,PageTitle,textareaClass,smallButtonClass} from "@/components/ui";
import {replyMessage} from "../actions";
export default function Page(props:PageProps<"/messages/[id]">){return <Suspense fallback={<Loading/>}><Content {...props}/></Suspense>;}
async function Content({params,searchParams}:PageProps<"/messages/[id]">){
 const {supabase}=await requireActive();const {id}=await params;const query=await searchParams;
 const {data:thread,error}=await supabase.from("minister_threads").select("id,subject").eq("id",id).maybeSingle();if(error)throw error;if(!thread)notFound();
 const {data,error:loadError}=await supabase.from("minister_messages").select("id,body,created_at,author:profiles(real_name)").eq("thread_id",id).order("created_at");if(loadError)throw loadError;
 return <><Link href="/messages" className="mb-4 text-sm text-accent">← 메시지함</Link><PageTitle sub="두 분과 지정 수신자에게만 공개되는 대화입니다.">{thread.subject}</PageTitle>{query.sent?<p role="status" className="mb-3 text-accent">답장을 보냈습니다.</p>:null}{query.error?<p role="alert" className="mb-3 text-red-600">답장을 저장하지 못했습니다. 다시 시도해 주세요.</p>:null}
 {(data??[]).map(m=><Card key={m.id} className="mb-3"><p className="mb-2 text-xs text-muted">{(m.author as unknown as {real_name:string}|null)?.real_name??"작성자"} · {new Date(m.created_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}</p><p className="whitespace-pre-wrap text-sm">{m.body}</p></Card>)}
 <form action={replyMessage} className="mt-4 flex flex-col gap-3"><input type="hidden" name="threadId" value={id}/><label htmlFor="reply" className="font-semibold">답장</label><textarea id="reply" name="body" required maxLength={5000} rows={4} className={textareaClass}/><SubmitButton className={smallButtonClass} pendingText="보내는 중…">답장 보내기</SubmitButton></form></>;
}
