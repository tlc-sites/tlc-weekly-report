"use server";
import {z} from "zod";
import {requireActive,isClergy} from "@/lib/auth";
import {isMonth,monthRange} from "@/lib/worship-staff-month";

export type MonthSaveResult = { ok: boolean; message?: string; rows: { serviceId: string; date: string; status: "saved" | "conflict" | "error"; updatedAt?: string }[] };

const input=z.object({
 month:z.string().refine(isMonth),
 rows:z.array(z.object({serviceId:z.uuid(),date:z.iso.date(),staff:z.string().trim().max(4000),updatedAt:z.string().max(100).nullable()})).min(1).max(150),
});

// 한 달 표에서 바뀐 칸만 저장한다. 다른 화면에서 먼저 고친 줄(updated_at이 다름)은 덮어쓰지 않고 '충돌'로 돌려준다.
export async function saveMonthStaff(raw:z.input<typeof input>):Promise<MonthSaveResult>{
 const {supabase,profile}=await requireActive();
 if(!isClergy(profile))return {ok:false,message:"교역자만 예배위원을 저장할 수 있습니다.",rows:[]};
 const parsed=input.safeParse(raw);
 if(!parsed.success)return {ok:false,message:"저장할 내용을 확인하지 못했습니다.",rows:[]};
 const {month,rows}=parsed.data;
 const {first,last}=monthRange(month);
 const out:MonthSaveResult["rows"]=[];
 for(const r of rows){
  if(r.date<first||r.date>last){out.push({serviceId:r.serviceId,date:r.date,status:"error"});continue;}
  const result=r.updatedAt
   ?await supabase.from("worship_staff").update({staff:r.staff,updated_by:profile.id}).eq("service_id",r.serviceId).eq("held_on",r.date).eq("updated_at",r.updatedAt).select("updated_at").maybeSingle()
   :await supabase.from("worship_staff").insert({service_id:r.serviceId,held_on:r.date,staff:r.staff,created_by:profile.id,updated_by:profile.id}).select("updated_at").maybeSingle();
  if(result.data)out.push({serviceId:r.serviceId,date:r.date,status:"saved",updatedAt:result.data.updated_at as string});
  else out.push({serviceId:r.serviceId,date:r.date,status:!result.error||result.error.code==="23505"?"conflict":"error"});
 }
 return {ok:out.every(r=>r.status==="saved"),rows:out};
}
