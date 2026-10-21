"use server";
import {requireActive} from "@/lib/auth";
import {z} from "zod";
import {redirect} from "next/navigation";
export async function saveMeetingSchedule(form:FormData){
 const {supabase}=await requireActive();
 const v=z.object({groupId:z.uuid(),scheduleId:z.uuid().optional(),label:z.string().trim().min(1).max(100),weekday:z.coerce.number().int().min(0).max(6),end_time:z.string().regex(/^\d{2}:\d{2}$/),active:z.enum(["true","false"])}).parse({...Object.fromEntries(form),scheduleId:form.get("scheduleId")||undefined});
 const row={label:v.label,weekday:v.weekday,end_time:v.end_time,is_active:v.active==="true"};
 const {error}=v.scheduleId?await supabase.from("meeting_deadline_schedules").update(row).eq("id",v.scheduleId).eq("group_id",v.groupId):await supabase.from("meeting_deadline_schedules").insert({...row,group_id:v.groupId});
 redirect("/groups/"+v.groupId+"/schedule?"+(error?"error=save":"saved=1"));
}
