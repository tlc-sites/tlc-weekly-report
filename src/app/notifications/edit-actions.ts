"use server";
import {requireActive} from "@/lib/auth";
import {refresh} from "next/cache";
import {z} from "zod";
const tables={report:"report_comments",incident:"incident_comments",prayer:"prayer_meeting_comments",notice:"notice_comments",report_reply:"report_comment_replies",incident_reply:"incident_comment_replies",prayer_reply:"prayer_comment_replies",notice_reply:"notice_comment_replies"} as const;
export async function editFeedback(_previous:{error:string;saved:boolean},form:FormData){
 const {supabase,profile}=await requireActive();const parsed=z.object({kind:z.enum(Object.keys(tables) as [keyof typeof tables,...(keyof typeof tables)[]]),id:z.uuid(),body:z.string().trim().min(1).max(1000)}).safeParse(Object.fromEntries(form));
 if(!parsed.success)return {error:"내용을 1~1000자로 입력해 주세요.",saved:false};
 const {kind,id,body}=parsed.data;const {data,error}=await supabase.from(tables[kind]).update({body}).eq("id",id).eq("author_id",profile.id).select("id");
 if(error||!data?.length)return {error:"수정하지 못했습니다. 본인이 쓴 코멘트인지와 열람 권한을 확인해 주세요.",saved:false};
 refresh();return {error:"",saved:true};
}
