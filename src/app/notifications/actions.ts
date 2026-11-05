"use server";
import {formFields} from "@/lib/form-text";
import {requireActive} from "@/lib/auth";
import {refresh} from "next/cache";
import {z} from "zod";
export async function loadNotifications(){const {supabase}=await requireActive();const {data,error}=await supabase.from("inbox_notifications").select("id,title,body,url,read_at,created_at").order("created_at",{ascending:false}).limit(150);if(error)throw new Error("알림을 불러오지 못했습니다.");return (data??[]).map(item=>({...item,title:item.title.replaceAll("새 목회 피드백이 등록되었습니다","새 코멘트가 등록되었습니다").replaceAll("새 피드백이 등록되었습니다","새 코멘트가 등록되었습니다").replaceAll("피드백에 답글","코멘트에 답글").replaceAll("댓글에 답글","코멘트에 답글")}));}
export async function addFeedbackReply(form:FormData){const {supabase,profile}=await requireActive();const v=z.object({kind:z.enum(["report","incident","prayer","notice"]),commentId:z.uuid(),body:z.string().trim().min(1).max(1000)}).parse(formFields(form));const {error}=await supabase.from(`${v.kind}_comment_replies`).insert({comment_id:v.commentId,author_id:profile.id,body:v.body});if(error)throw new Error("답글을 저장하지 못했습니다. 열람 권한과 내용을 확인해 주세요.");refresh();}

export async function loadUnreadNotificationCount(){const {supabase}=await requireActive();const {count,error}=await supabase.from("inbox_notifications").select("id",{count:"exact",head:true}).is("read_at",null);if(error)throw new Error("알림 수를 불러오지 못했습니다.");return count??0;}
