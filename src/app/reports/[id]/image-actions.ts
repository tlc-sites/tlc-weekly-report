"use server";

import {refresh} from "next/cache";
import {z} from "zod";
import {requireActive} from "@/lib/auth";

const BUCKET="report-images";
type Result={ok:true}|{ok:false;message:string};

// 브라우저가 Storage에 올린 사진을 보고서에 연결한다. 실패하면 올린 파일을 지운다.
export async function attachReportImage(reportId:string,path:string,caption:string):Promise<Result>{
 const {supabase,profile}=await requireActive();
 const v=z.object({reportId:z.uuid(),path:z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/),caption:z.string().trim().max(200)}).safeParse({reportId,path,caption});
 if(!v.success||!v.data.path.startsWith(v.data.reportId+"/"))return {ok:false,message:"사진 정보가 올바르지 않습니다."};
 const {error}=await supabase.from("report_images").insert({report_id:v.data.reportId,path:v.data.path,caption:v.data.caption,created_by:profile.id});
 if(error){
  await supabase.storage.from(BUCKET).remove([v.data.path]);
  return {ok:false,message:/too many/.test(error.message)?"사진은 보고서마다 5장까지 올릴 수 있습니다.":"사진을 보고서에 연결하지 못했습니다. 권한을 확인해 주세요."};
 }
 refresh();
 return {ok:true};
}

export async function removeReportImage(imageId:string):Promise<Result>{
 const {supabase}=await requireActive();
 if(!z.uuid().safeParse(imageId).success)return {ok:false,message:"사진 정보가 올바르지 않습니다."};
 const {data,error}=await supabase.from("report_images").delete().eq("id",imageId).select("path").maybeSingle();
 if(error||!data)return {ok:false,message:"사진을 지우지 못했습니다. 권한을 확인해 주세요."};
 await supabase.storage.from(BUCKET).remove([data.path]);
 refresh();
 return {ok:true};
}
