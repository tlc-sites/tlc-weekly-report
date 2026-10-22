"use server";
import {requireActive,isClergy} from "@/lib/auth";
import {redirect} from "next/navigation";
import {z} from "zod";
import {todayKST} from "@/lib/week";
export async function saveWorshipStaff(form:FormData){const {supabase,profile}=await requireActive();const v=z.object({serviceId:z.uuid(),date:z.iso.date(),staff:z.string().trim().max(4000)}).safeParse(Object.fromEntries(form));if(!v.success||!isClergy(profile)||v.data.date>todayKST())redirect("/worship-staff?error=save");const {serviceId,date,staff}=v.data;
 const {data:existing,error:readError}=await supabase.from("worship_staff").select("service_id").eq("service_id",serviceId).eq("held_on",date).maybeSingle();if(readError)redirect("/worship-staff?error=save");
 const result=existing?await supabase.from("worship_staff").update({staff,updated_by:profile.id}).eq("service_id",serviceId).eq("held_on",date).select("service_id"):await supabase.from("worship_staff").insert({service_id:serviceId,held_on:date,staff,created_by:profile.id,updated_by:profile.id}).select("service_id");
 redirect("/worship-staff?date="+date+"&"+(result.error||!result.data?.length?"error=save":"saved=1"));}
