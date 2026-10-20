"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireActive, isClergy } from "@/lib/auth";

export async function addIncidentFeedback(formData:FormData) {
  const {supabase,profile}=await requireActive();
  if(!isClergy(profile)) throw new Error("피드백 작성 권한이 없습니다.");
  const value=z.object({incidentId:z.uuid(),body:z.string().trim().min(1).max(1000)}).parse({incidentId:formData.get("incidentId"),body:formData.get("body")});
  const {error}=await supabase.from("incident_comments").insert({incident_id:value.incidentId,author_id:profile.id,body:value.body});
  if(error) throw new Error("피드백을 저장하지 못했습니다.");
  refresh();
}
export async function deleteIncidentFeedback(formData:FormData) {
  const {supabase,profile}=await requireActive();
  if(!isClergy(profile)) throw new Error("피드백 수정 권한이 없습니다.");
  const value=z.object({incidentId:z.uuid(),commentId:z.uuid()}).parse({incidentId:formData.get("incidentId"),commentId:formData.get("commentId")});
  const {error}=await supabase.from("incident_comments").delete().eq("id",value.commentId).eq("incident_id",value.incidentId);
  if(error) throw new Error("피드백을 삭제하지 못했습니다.");
  refresh();
}

export async function changeIncidentShare(formData:FormData) {
  const {supabase,profile}=await requireActive();
  if(!isClergy(profile)) throw new Error("공개 설정 권한이 없습니다.");
  const value=z.object({incidentId:z.uuid(),ministerId:z.uuid(),operation:z.enum(["grant","revoke"])}).parse(Object.fromEntries(formData));
  const row={incident_id:value.incidentId,minister_id:value.ministerId};
  const {error}=value.operation==="grant" ? await supabase.from("incident_shares").upsert({...row,shared_by:profile.id},{ignoreDuplicates:true,onConflict:"incident_id,minister_id"}) : await supabase.from("incident_shares").delete().match(row);
  if(error) throw new Error("공개 설정을 저장하지 못했습니다.");
  refresh();
}
