"use server";
import {z} from "zod";
import {redirect} from "next/navigation";
import {requireActive} from "@/lib/auth";
export async function saveRehearsal(form:FormData){
  const {supabase}=await requireActive();
  const meta=z.object({groupId:z.uuid(),heldOn:z.iso.date(),title:z.string().trim().min(1).max(100)}).parse(Object.fromEntries(form));
  const rows=form.getAll("memberId").map(id=>({member_id:id,status:form.get(`status:${id}`),note:form.get(`note:${id}`)??""}));
  const parsed=z.array(z.object({member_id:z.uuid(),status:z.enum(["attended","absent","excused"]),note:z.string().trim().max(200)})).max(300).safeParse(rows);
  const path=`/groups/${meta.groupId}/rehearsals?date=${meta.heldOn}`;
  if(!parsed.success)redirect(path+"&error=invalid");
  const {error}=await supabase.rpc("save_rehearsal",{p_group:meta.groupId,p_date:meta.heldOn,p_title:meta.title,p_rows:parsed.data});
  redirect(path+(error?"&error=save":"&saved=1"));
}
