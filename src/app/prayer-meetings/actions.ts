"use server";
import {requireActive} from "@/lib/auth";
import {z} from "zod";
import {redirect} from "next/navigation";
import {todayKST,weekdayOf} from "@/lib/week";
export async function addPrayerMeeting(form:FormData){
 const {supabase,profile}=await requireActive();
 const v=z.object({meeting_date:z.iso.date(),prayer_session:z.enum(["morning","evening"]),attendee_names:z.string().trim().min(1).max(3000),prayer_topics:z.string().trim().min(1).max(5000)}).safeParse(Object.fromEntries(form));
 if(!v.success || v.data.meeting_date>todayKST() || !(v.data.prayer_session==="morning"?[1,2,4,5]:[1,2,3,4]).includes(weekdayOf(v.data.meeting_date)))redirect("/prayer-meetings?error=invalid");
 const {error}=await supabase.from("prayer_meeting_reports").insert({...v.data,author_name:profile.real_name??"교역자",author_id:profile.id,title:v.data.prayer_session==="morning"?"오전기도회":"저녁기도회",content:"기도제목 보고"});
 if(error)redirect("/prayer-meetings?error=save");
 await supabase.from("prayer_meeting_drafts").delete().eq("author_id",profile.id);
 redirect("/prayer-meetings?saved=1");
}
// 새 기도회 보고 임시저장: 빈 칸이 있어도 본인 초안 하나에 덮어쓴다. 등록하면 지운다.
export async function savePrayerDraft(form:FormData){
 const {supabase,profile}=await requireActive();
 const text=(k:string)=>String(form.get(k)??"").replace(/\r\n?/g,"\n");
 const v=z.object({meeting_date:z.union([z.iso.date(),z.literal("").transform(()=>null)]),prayer_session:z.enum(["morning","evening"]),attendee_names:z.string().max(3000),prayer_topics:z.string().max(5000)}).safeParse({meeting_date:form.get("meeting_date")??"",prayer_session:form.get("prayer_session"),attendee_names:text("attendee_names"),prayer_topics:text("prayer_topics")});
 if(!v.success)redirect("/prayer-meetings?error=draft");
 const {error}=await supabase.from("prayer_meeting_drafts").upsert({...v.data,author_id:profile.id,updated_at:new Date().toISOString()});
 redirect("/prayer-meetings?"+(error?"error=draft":"drafted=1"));
}
// 작성한 교역자 본인만 수정한다 (DB 정책과 같은 조건)
export async function editPrayerMeeting(form:FormData){
 const {supabase,profile}=await requireActive();
 const v=z.object({id:z.uuid(),meeting_date:z.iso.date(),prayer_session:z.enum(["morning","evening"]),attendee_names:z.string().trim().min(1).max(3000),prayer_topics:z.string().trim().min(1).max(5000)}).safeParse(Object.fromEntries(form));
 if(!v.success)redirect("/prayer-meetings?error=invalid");
 const back="#prayer-"+v.data.id;
 if(v.data.meeting_date>todayKST() || !(v.data.prayer_session==="morning"?[1,2,4,5]:[1,2,3,4]).includes(weekdayOf(v.data.meeting_date)))redirect("/prayer-meetings?error=invalid"+back);
 const {id,...fields}=v.data;
 const {data,error}=await supabase.from("prayer_meeting_reports").update({...fields,title:fields.prayer_session==="morning"?"오전기도회":"저녁기도회"}).eq("id",id).eq("author_id",profile.id).select("id");
 redirect("/prayer-meetings?"+(error||!data?.length?"error=save":"edited=1")+back);
}
export async function addPrayerComment(form:FormData){
 const {supabase,profile}=await requireActive();const v=z.object({reportId:z.uuid(),body:z.string().trim().min(1).max(1000)}).parse(Object.fromEntries(form));
 const {error}=await supabase.from("prayer_meeting_comments").insert({prayer_report_id:v.reportId,author_id:profile.id,body:v.body});
 redirect("/prayer-meetings?"+(error?"error=comment":"commented=1")+"#prayer-"+v.reportId);
}
