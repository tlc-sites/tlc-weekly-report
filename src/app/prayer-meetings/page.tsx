import {PrayerFields} from "./prayer-fields";
import {Suspense} from "react";
import Link from "next/link";
import {requireActive,isClergy} from "@/lib/auth";
import {redirect} from "next/navigation";
import {todayKST} from "@/lib/week";
import {Card,PageTitle,Loading,textareaClass,smallButtonClass} from "@/components/ui";
import {addPrayerMeeting,addPrayerComment} from "./actions";
export default function Page(props:PageProps<"/prayer-meetings">){return <Suspense fallback={<Loading/>}><Content {...props}/></Suspense>;}
async function Content({searchParams}:PageProps<"/prayer-meetings">){
 const {supabase,profile}=await requireActive();if(!isClergy(profile))redirect("/");
 const q=await searchParams;const today=todayKST();
 const {data,error}=await supabase.from("prayer_meeting_reports").select("id,author_name,meeting_date,prayer_session,prayer_topics,attendee_names").order("meeting_date",{ascending:false}).order("created_at",{ascending:false}).limit(50);if(error)throw error;
 const ids=(data??[]).map(r=>r.id);const comments=ids.length?await supabase.from("prayer_meeting_comments").select("id,prayer_report_id,body,created_at,author:profiles(real_name)").in("prayer_report_id",ids).order("created_at"):null;if(comments?.error)throw comments.error;
 return <><Link href="/" className="mb-4 text-sm text-accent">← 홈</Link><PageTitle sub="오전: 월·화·목·금 10:00 / 저녁: 월·화·수·목 20:30">주중 기도회</PageTitle>{q.saved||q.commented?<p role="status" className="mb-4 text-accent">{q.saved?"기도제목을 등록했습니다.":"코멘트를 등록했습니다."}</p>:null}{q.error?<p role="alert" className="mb-4 text-red-600">저장하지 못했습니다. 모임 요일·참석명단·기도제목을 확인해 주세요.</p>:null}
 <Card className="mb-5"><form action={addPrayerMeeting} className="flex flex-col gap-3"><PrayerFields today={today}/><p className="text-xs text-muted">작성자는 로그인한 계정으로 자동 기록합니다.</p><button className={smallButtonClass}>기도제목 등록</button></form></Card>
 <h2 className="mb-3 font-semibold">함께 나누는 기도제목</h2>{!data?.length?<p className="text-sm text-muted">아직 등록된 기도제목이 없습니다.</p>:data.map(r=><Card key={r.id} className="mb-4"><article id={"prayer-"+r.id}><h3 className="font-semibold">{r.meeting_date} · {r.prayer_session==="morning"?"오전기도회":r.prayer_session==="evening"?"저녁기도회":"기존 기도회 기록"}</h3><p className="text-xs text-muted">{r.author_name}</p>{r.attendee_names?<p className="my-3 whitespace-pre-wrap break-words text-sm"><strong>참석명단:</strong> {r.attendee_names}</p>:null}<p className="my-3 whitespace-pre-wrap">{r.prayer_topics}</p><div className="border-t border-border pt-3"><h4 className="text-sm font-semibold">코멘트</h4>{(comments?.data??[]).filter(c=>c.prayer_report_id===r.id).map(c=><div key={c.id} className="my-3 text-sm"><p className="text-xs text-muted">{(c.author as unknown as {real_name:string}|null)?.real_name??"교역자"} · {new Date(c.created_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}</p><p className="whitespace-pre-wrap">{c.body}</p></div>)}<form action={addPrayerComment} className="mt-3 flex flex-col gap-2"><input type="hidden" name="reportId" value={r.id}/><textarea name="body" aria-label="기도제목 코멘트" required rows={2} maxLength={1000} className={textareaClass}/><button className={smallButtonClass}>코멘트 등록</button></form></div></article></Card>)}</>;
}
