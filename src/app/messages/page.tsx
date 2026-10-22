import {MinisterMessageComposer} from "@/components/minister-message-composer";
import {Suspense} from "react";
import Link from "next/link";
import {requireActive,isClergy} from "@/lib/auth";
import {redirect} from "next/navigation";
import {PageTitle,Loading} from "@/components/ui";

export default function Page(props:PageProps<"/messages">){return <Suspense fallback={<Loading/>}><Content {...props}/></Suspense>;}
async function Content({searchParams}:PageProps<"/messages">){
 const {supabase,profile}=await requireActive();if(!isClergy(profile))redirect("/");
 const query=await searchParams;
 const {data,error}=await supabase.from("minister_threads").select("id,subject,created_at,recipient:profiles!minister_threads_recipient_id_fkey(real_name)").order("created_at",{ascending:false}).limit(50);if(error)throw error;
 return <><Link href="/" className="mb-4 text-sm text-accent">← 홈</Link><PageTitle sub="담임 목사님·담임 사모님과 지정한 담당 교역자만 볼 수 있습니다.">비공개 메시지</PageTitle>{query.error?<p role="alert" className="mb-4 text-red-600">전송하지 못했습니다. 수신자와 내용을 확인해 주세요.</p>:null}
 <MinisterMessageComposer supabase={supabase} profile={profile}/>
 {!data?.length?<p className="text-sm text-muted">아직 메시지가 없습니다.</p>:<ul className="divide-y divide-border">{data.map(t=><li key={t.id}><Link href={"/messages/"+t.id} className="block py-4"><span className="block text-xs text-muted">{new Date(t.created_at).toLocaleDateString("ko-KR",{timeZone:"Asia/Seoul"})} · {(t.recipient as unknown as {real_name:string}|null)?.real_name??"담당 교역자"}</span><strong>{t.subject}</strong></Link></li>)}</ul>}</>;
}
