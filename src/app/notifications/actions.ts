"use server";
import {requireActive} from "@/lib/auth";
import {refresh} from "next/cache";
import {z} from "zod";
export async function loadNotifications(){const {supabase}=await requireActive();const {data,error}=await supabase.from("inbox_notifications").select("id,title,body,url,read_at").order("created_at",{ascending:false}).limit(50);if(error)throw new Error("알림을 불러오지 못했습니다.");return data??[];}
export async function readNotification(id:string){const {supabase}=await requireActive();const {error}=await supabase.rpc("read_notification",{p_id:z.uuid().parse(id)});if(error)throw new Error("읽음 상태를 저장하지 못했습니다.");}
export async function addFeedbackReply(form:FormData){const {supabase,profile}=await requireActive();const v=z.object({kind:z.enum(["report","incident"]),commentId:z.uuid(),body:z.string().trim().min(1).max(1000)}).parse(Object.fromEntries(form));const {error}=await supabase.from(`${v.kind}_comment_replies`).insert({comment_id:v.commentId,author_id:profile.id,body:v.body});if(error)throw new Error("답글을 저장하지 못했습니다. 열람 권한과 내용을 확인해 주세요.");refresh();}
