"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireActive, isClergy } from "@/lib/auth";

export async function changePrivateShare(formData:FormData) {
  const {supabase,profile}=await requireActive();
  if(!isClergy(profile)) throw new Error("공개 설정 권한이 없습니다.");
  const value=z.object({reportId:z.uuid(),ministerId:z.uuid(),kind:z.enum(["report","prayer","pastor","pastor_wife"]),operation:z.enum(["grant","revoke"])}).parse({reportId:formData.get("reportId"),ministerId:formData.get("ministerId"),kind:formData.get("kind"),operation:formData.get("operation")});
  const row={report_id:value.reportId,minister_id:value.ministerId,content_kind:value.kind};
  const {error}=value.operation==="grant"
    ? await supabase.from("private_shares").upsert({...row,shared_by:profile.id},{onConflict:"report_id,content_kind,minister_id",ignoreDuplicates:true})
    : await supabase.from("private_shares").delete().match(row);
  if(error) throw new Error("공개 설정을 저장하지 못했습니다.");
  refresh();
}
