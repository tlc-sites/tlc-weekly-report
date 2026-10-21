"use server";
import {requireActive} from "@/lib/auth";
import {z} from "zod";
import {redirect} from "next/navigation";
const marks=z.enum(["present","late","absent","excused"]);
export async function addParticipant(form:FormData){
 const {supabase,profile}=await requireActive();
 const v=z.object({groupId:z.uuid(),name:z.string().trim().min(1).max(100)}).parse(Object.fromEntries(form));
 const {error}=await supabase.from("internship_participants").insert({group_id:v.groupId,name:v.name,created_by:profile.id});
 redirect("/groups/"+v.groupId+"/attendance?"+(error?"error=save":"added=1"));
}
export async function setParticipantActive(form:FormData){
 const {supabase}=await requireActive();
 const v=z.object({groupId:z.uuid(),participantId:z.uuid(),active:z.enum(["true","false"])}).parse(Object.fromEntries(form));
 const {error}=await supabase.from("internship_participants").update({is_active:v.active==="true"}).eq("id",v.participantId).eq("group_id",v.groupId);
 redirect("/groups/"+v.groupId+"/attendance?"+(error?"error=save":"changed=1"));
}
export async function saveAttendance(form:FormData){
 const {supabase}=await requireActive();
 const v=z.object({groupId:z.uuid(),date:z.iso.date()}).parse(Object.fromEntries(form));
 const rows=[];for(const [key,value] of form.entries())if(key.startsWith("mark:")){const pid=z.uuid().parse(key.slice(5));rows.push({participant_id:pid,mark:marks.parse(value),note:z.string().trim().max(500).parse(form.get("note:"+pid)??"")});}
 const {error}=await supabase.rpc("save_internship_attendance",{p_group:v.groupId,p_date:v.date,p_rows:rows});
 redirect("/groups/"+v.groupId+"/attendance?date="+v.date+"&"+(error?"error=save":"saved=1"));
}
