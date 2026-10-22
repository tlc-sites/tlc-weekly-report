"use server";
import {requireActive} from "@/lib/auth";
import {z} from "zod";
import {redirect} from "next/navigation";
export async function saveTeamMember(form:FormData){
 const {supabase,profile}=await requireActive();
 const v=z.object({groupId:z.uuid(),name:z.string().trim().min(1).max(100),duty:z.string().trim().max(200)}).parse(Object.fromEntries(form));
 const {error}=await supabase.from("team_directory").insert({group_id:v.groupId,name:v.name,duty:v.duty,created_by:profile.id});
 redirect("/groups/"+v.groupId+"/team?"+(error?"error=save":"saved=1"));
}
export async function setTeamMemberActive(form:FormData){
 const {supabase}=await requireActive();
 const v=z.object({groupId:z.uuid(),memberId:z.uuid(),active:z.enum(["true","false"])}).parse(Object.fromEntries(form));
 const {error}=await supabase.from("team_directory").update({is_active:v.active==="true"}).eq("id",v.memberId).eq("group_id",v.groupId);
 redirect("/groups/"+v.groupId+"/team?"+(error?"error=save":"saved=1"));
}

export async function updateTeamMember(form:FormData){
 const {supabase}=await requireActive();
 const v=z.object({groupId:z.uuid(),memberId:z.uuid(),name:z.string().trim().min(1).max(100),duty:z.string().trim().max(200)}).parse(Object.fromEntries(form));
 const {data,error}=await supabase.from("team_directory").update({name:v.name,duty:v.duty}).eq("id",v.memberId).eq("group_id",v.groupId).select("id").maybeSingle();
 redirect("/groups/"+v.groupId+"/team?"+(error||!data?"error=save":"saved=1"));
}
