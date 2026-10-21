import {Suspense} from "react";
import Link from "next/link";
import {requireActive,isClergy} from "@/lib/auth";
import {redirect} from "next/navigation";
import {todayKST} from "@/lib/week";
import {Card,Field,PageTitle,Loading,textareaClass,smallButtonClass} from "@/components/ui";
import {addPrayerMeeting} from "./actions";
export default function Page(props:PageProps<"/prayer-meetings">){return <Suspense fallback={<Loading/>}><Content {...props}/></Suspense>;}
async function Content({searchParams}:PageProps<"/prayer-meetings">){
 const {supabase,profile}=await requireActive();if(!isClergy(profile))redirect("/");
 const query=await searchParams;
 const {data,error}=await supabase.from("prayer_meeting_reports").select("id,author_name,meeting_date,title,scripture,content,prayer_topics,notes,prayer_leader,attendee_names").order("meeting_date",{ascending:false}).order("created_at",{ascending:false}).limit(50);if(error)throw error;
 return <><Link href="/" className="mb-4 text-sm text-accent">← 홈</Link><PageTitle sub="교역자 이상이 함께 작성하고 나누는 기도회 보고입니다.">주중 기도회</PageTitle>{query.saved?<p role="status" className="mb-4 text-accent">제출이 완료되었습니다!</p>:null}{query.error?<p role="alert" className="mb-4 text-red-600">저장하지 못했습니다. 입력 내용과 날짜를 확인해 주세요.</p>:null}
 <Card className="mb-5"><details><summary className="cursor-pointer font-semibold">기도회 보고 작성</summary><form action={addPrayerMeeting} className="mt-4 flex flex-col gap-3">
 <Field label="작성자 이름"><input name="author_name" required maxLength={100} defaultValue={profile.real_name??""} className={textareaClass}/></Field>
 <Field label="기도회 날짜"><input type="date" name="meeting_date" required defaultValue={todayKST()} max={todayKST()} className={textareaClass}/></Field>
 <Field label="기도인도자"><input name="prayer_leader" required maxLength={100} className={textareaClass}/></Field>
 <Field label="참석명단"><textarea name="attendee_names" required rows={3} maxLength={3000} placeholder="이름을 한 줄에 한 명씩 적어 주세요." className={textareaClass}/></Field>
 <Field label="제목 (선택)"><input name="title" maxLength={150} className={textareaClass}/></Field>
 <Field label="말씀 본문"><input name="scripture" maxLength={1000} className={textareaClass}/></Field>
 <Field label="진행 내용"><textarea name="content" rows={4} maxLength={5000} className={textareaClass}/></Field>
 <Field label="함께 기도한 제목"><textarea name="prayer_topics" rows={3} maxLength={5000} className={textareaClass}/></Field>
 <Field label="특이사항·후속 조치"><textarea name="notes" rows={2} maxLength={3000} className={textareaClass}/></Field><button className={smallButtonClass}>보고 제출</button></form></details></Card>
 <h2 className="mb-3 font-semibold">공유된 보고</h2>{!data?.length?<p className="text-sm text-muted">아직 등록된 기도회 보고가 없습니다.</p>:data.map(r=><Card key={r.id} className="mb-3"><details><summary className="cursor-pointer"><span className="block text-xs text-muted">{r.meeting_date} · {r.author_name}</span><strong>{r.title}</strong></summary><dl className="mt-4 space-y-3">{[["기도인도자",r.prayer_leader],["참석명단",r.attendee_names],["말씀 본문",r.scripture],["진행 내용",r.content],["기도제목",r.prayer_topics],["특이사항",r.notes]].map(([label,body])=>body?<div key={label}><dt className="text-xs text-muted">{label}</dt><dd className="whitespace-pre-wrap text-sm">{body}</dd></div>:null)}</dl></details></Card>)}</>;
}
