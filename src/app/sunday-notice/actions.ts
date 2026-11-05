"use server";
import {z} from "zod";
import {redirect} from "next/navigation";
import {formFields} from "@/lib/form-text";
import {requireActive,isClergy} from "@/lib/auth";
import {todayKST,weekdayOf} from "@/lib/week";

const canWrite=(p:{is_admin:boolean}&Parameters<typeof isClergy>[0])=>isClergy(p)||p.is_admin;

// 주일마다 하나. 있으면 고치고 없으면 새로 쓴다. 지난 주일 공지는 고치지 않는다.
export async function saveSundayNotice(form:FormData){
 const {supabase,profile}=await requireActive();
 const v=z.object({sunday:z.iso.date(),body:z.string().trim().min(1).max(1000)}).safeParse(formFields(form));
 if(!v.success||!canWrite(profile)||weekdayOf(v.data.sunday)!==0||v.data.sunday<todayKST())redirect("/sunday-notice?error=save");
 const {sunday,body}=v.data;
 const {data:existing}=await supabase.from("sunday_notices").select("sunday").eq("sunday",sunday).maybeSingle();
 const {error}=existing?await supabase.from("sunday_notices").update({body}).eq("sunday",sunday):await supabase.from("sunday_notices").insert({sunday,body});
 redirect(`/sunday-notice?sunday=${sunday}&${error?"error=save":"saved=1"}`);
}

export async function deleteSundayNotice(form:FormData){
 const {supabase,profile}=await requireActive();
 const v=z.object({sunday:z.iso.date()}).safeParse(formFields(form));
 if(!v.success||!canWrite(profile))redirect("/sunday-notice?error=delete");
 const {error}=await supabase.from("sunday_notices").delete().eq("sunday",v.data.sunday);
 redirect(`/sunday-notice?sunday=${v.data.sunday}&${error?"error=delete":"deleted=1"}`);
}
