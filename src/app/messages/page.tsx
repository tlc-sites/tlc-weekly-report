import {Suspense} from "react";
import Link from "next/link";
import {requireActive,isClergy,isSenior} from "@/lib/auth";
import {redirect} from "next/navigation";
import {Card,Field,PageTitle,Loading,textareaClass,smallButtonClass} from "@/components/ui";
import {startMessage} from "./actions";
export default function Page(props:PageProps<"/messages">){return <Suspense fallback={<Loading/>}><Content {...props}/></Suspense>;}
async function Content({searchParams}:PageProps<"/messages">){
 const {supabase,profile}=await requireActive();if(!isClergy(profile))redirect("/");
 const query=await searchParams;
 const {data,error}=await supabase.from("minister_threads").select("id,subject,created_at,recipient:profiles!minister_threads_recipient_id_fkey(real_name)").order("created_at",{ascending:false}).limit(50);if(error)throw error;
 const recipients=isSenior(profile)?await supabase.from("profiles").select("id,real_name").eq("status","active").eq("is_minister",true).neq("id",profile.id).order("real_name"):null;
 return <><Link href="/" className="mb-4 text-sm text-accent">← 홈</Link><PageTitle sub="담임 목사님·담임 사모님과 지정한 담당 교역자만 볼 수 있습니다.">비공개 메시지</PageTitle>{query.error?<p role="alert" className="mb-4 text-red-600">전송하지 못했습니다. 수신자와 내용을 확인해 주세요.</p>:null}
 {isSenior(profile)?<Card className="mb-5"><details><summary className="cursor-pointer font-semibold">담당 교역자에게 메시지 보내기</summary><form action={startMessage} className="mt-4 flex flex-col gap-3"><Field label="받는 교역자"><select name="recipient" required className={textareaClass}><option value="">선택해 주세요</option>{(recipients?.data??[]).map(p=><option key={p.id} value={p.id}>{p.real_name??"교역자"}</option>)}</select></Field><Field label="제목"><input name="subject" required maxLength={150} className={textareaClass}/></Field><Field label="내용"><textarea name="body" required rows={4} maxLength={5000} className={textareaClass}/></Field><button className={smallButtonClass}>메시지 보내기</button></form></details></Card>:null}
 {!data?.length?<p className="text-sm text-muted">아직 메시지가 없습니다.</p>:<ul className="divide-y divide-border">{data.map(t=><li key={t.id}><Link href={"/messages/"+t.id} className="block py-4"><span className="block text-xs text-muted">{new Date(t.created_at).toLocaleDateString("ko-KR",{timeZone:"Asia/Seoul"})} · {(t.recipient as unknown as {real_name:string}|null)?.real_name??"담당 교역자"}</span><strong>{t.subject}</strong></Link></li>)}</ul>}</>;
}
