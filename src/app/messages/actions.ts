"use server";
import {requireActive,isSenior} from "@/lib/auth";
import {redirect} from "next/navigation";
import {z} from "zod";
export async function startMessage(form:FormData){
 const {supabase,profile}=await requireActive();if(!isSenior(profile))redirect("/messages");
 const v=z.object({recipient:z.uuid(),subject:z.string().trim().min(1).max(150),body:z.string().trim().min(1).max(5000)}).safeParse(Object.fromEntries(form));
 if(!v.success)redirect("/messages?error=invalid");
 const {data,error}=await supabase.rpc("start_minister_thread",{p_recipient:v.data.recipient,p_subject:v.data.subject,p_body:v.data.body});
 if(error || !data)redirect("/messages?error=save");
 redirect("/messages/"+data);
}
export async function replyMessage(form:FormData){
 const {supabase,profile}=await requireActive();
 const v=z.object({threadId:z.uuid(),body:z.string().trim().min(1).max(5000)}).safeParse(Object.fromEntries(form));
 if(!v.success)redirect("/messages?error=invalid");
 const {error}=await supabase.from("minister_messages").insert({thread_id:v.data.threadId,author_id:profile.id,body:v.data.body});
 if(error)redirect("/messages/"+v.data.threadId+"?error=save");
 redirect("/messages/"+v.data.threadId+"?sent=1");
}
