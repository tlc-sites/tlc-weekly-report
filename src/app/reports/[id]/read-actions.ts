"use server";
import {requireActive,isSenior} from "@/lib/auth";
import {z} from "zod";
export async function markSeniorRead(reportId:string,version:string){
 const {supabase,profile}=await requireActive();
 if(!isSenior(profile)||!z.uuid().safeParse(reportId).success||!z.iso.datetime({offset:true}).safeParse(version).success)return null;
 const {data,error}=await supabase.rpc("mark_senior_report_read",{p_report:reportId,p_version:version});
 return error?null:{role:profile.recipient_role!,version,viewedAt:data as string};
}
