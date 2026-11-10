"use server";
import {after} from "next/server";
import {redirect} from "next/navigation";
import {z} from "zod";
import {formFields} from "@/lib/form-text";
import {requireActive,isSenior} from "@/lib/auth";
import {notifyAgenda} from "@/lib/agenda-push";

// 부서 안건방. 누가 무엇을 할 수 있는지는 DB(RLS·set_agenda_status)가 정하고, 여기서는 입력만 확인한다.
const pushLater=(agendaId:string,since:string)=>after(async()=>{
 try{await notifyAgenda(agendaId,since);}catch{console.error("[agenda-push] 저장은 됐지만 푸시를 전달하지 못했습니다.");}
});

export async function createAgenda(form:FormData){
 const {supabase,profile}=await requireActive();if(!isSenior(profile))redirect("/agenda");
 const v=z.object({group:z.uuid(),title:z.string().trim().min(1).max(150),body:z.string().trim().min(1)}).safeParse(formFields(form));
 if(!v.success)redirect("/agenda?error=invalid");
 const since=new Date().toISOString();
 const {data,error}=await supabase.from("agenda_items").insert({group_id:v.data.group,author_id:profile.id,title:v.data.title,body:v.data.body}).select("id").single();
 if(error||!data)redirect("/agenda?error=save");
 pushLater(data.id,since);
 redirect("/agenda/"+data.id+"?created=1");
}

export async function replyAgenda(form:FormData){
 const {supabase,profile}=await requireActive();
 const v=z.object({agendaId:z.uuid(),body:z.string().trim().min(1)}).safeParse(formFields(form));
 if(!v.success)redirect("/agenda?error=invalid");
 const since=new Date().toISOString();
 const {data,error}=await supabase.from("agenda_replies").insert({agenda_id:v.data.agendaId,author_id:profile.id,body:v.data.body}).select("id").single();
 if(error||!data)redirect("/agenda/"+v.data.agendaId+"?error=save");
 pushLater(v.data.agendaId,since);
 redirect("/agenda/"+v.data.agendaId+"?sent=1#reply-"+data.id);
}

export async function setAgendaStatus(form:FormData){
 const {supabase}=await requireActive();
 const v=z.object({agendaId:z.uuid(),done:z.enum(["1","0"])}).safeParse(formFields(form));
 if(!v.success)redirect("/agenda?error=invalid");
 const {error}=await supabase.rpc("set_agenda_status",{p_agenda:v.data.agendaId,p_done:v.data.done==="1"});
 if(error)redirect("/agenda/"+v.data.agendaId+"?error=status");
 redirect("/agenda/"+v.data.agendaId+"?status="+(v.data.done==="1"?"done":"open"));
}

export async function deleteAgenda(form:FormData){
 const {supabase,profile}=await requireActive();
 const v=z.object({agendaId:z.uuid()}).safeParse(formFields(form));
 if(!v.success)redirect("/agenda?error=invalid");
 const {data,error}=await supabase.from("agenda_items").delete().eq("id",v.data.agendaId).eq("author_id",profile.id).select("id");
 if(error||!data?.length)redirect("/agenda/"+v.data.agendaId+"?error=delete");
 redirect("/agenda?deleted=1");
}

export async function deleteAgendaReply(form:FormData){
 const {supabase,profile}=await requireActive();
 const v=z.object({agendaId:z.uuid(),replyId:z.uuid()}).safeParse(formFields(form));
 if(!v.success)redirect("/agenda?error=invalid");
 const {data,error}=await supabase.from("agenda_replies").delete().eq("id",v.data.replyId).eq("author_id",profile.id).select("id");
 if(error||!data?.length)redirect("/agenda/"+v.data.agendaId+"?error=delete");
 redirect("/agenda/"+v.data.agendaId+"?replyDeleted=1");
}
