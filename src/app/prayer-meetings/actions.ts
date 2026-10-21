"use server";
import {requireActive,isClergy} from "@/lib/auth";
import {z} from "zod";
import {redirect} from "next/navigation";
import {todayKST} from "@/lib/week";
export async function addPrayerMeeting(form:FormData){
 const {supabase,profile}=await requireActive();if(!isClergy(profile))redirect("/");
 const v=z.object({meeting_date:z.iso.date(),author_name:z.string().trim().min(1).max(100),prayer_leader:z.string().trim().min(1).max(100),attendee_names:z.string().trim().min(1).max(3000),title:z.string().trim().max(150),scripture:z.string().trim().max(1000),content:z.string().trim().max(5000),prayer_topics:z.string().trim().max(5000),notes:z.string().trim().max(3000)}).safeParse(Object.fromEntries(form));
 if(!v.success || v.data.meeting_date>todayKST())redirect("/prayer-meetings?error=invalid");
 const {error}=await supabase.from("prayer_meeting_reports").insert({...v.data,title:v.data.title||"주중 기도회",content:v.data.content||"기도회",author_id:profile.id});
 if(error)redirect("/prayer-meetings?error=save");
 redirect("/prayer-meetings?saved=1");
}
