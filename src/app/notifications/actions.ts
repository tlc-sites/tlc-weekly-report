"use server";
import {formFields} from "@/lib/form-text";
import {requireActive} from "@/lib/auth";
import {refresh} from "next/cache";
import {z} from "zod";
import {groupDisplayName,meetingDisplayName} from "@/lib/group-display";
import {formatDate} from "@/lib/week";
const REPORT_URL=/^\/reports\/([0-9a-f-]{36})(?:[/?#]|$)/i;
type ReportContext={id:string;meeting_date:string;meeting_label:string|null;group:{name:string}|null;service:{name:string}|null;meeting:{name:string}|null};
// 보고서 알림에는 어느 예배·모임(몇 부, 언제)의 보고인지 붙인다. 알림 글은 그대로 두고, 지금 볼 수 있는 보고서만 표시한다.
function reportContext(r:ReportContext){const what=r.service?.name??(r.meeting?.name?meetingDisplayName(r.meeting.name):null)??r.meeting_label;return [what,formatDate(r.meeting_date),r.group?.name?groupDisplayName(r.group.name):null].filter(Boolean).join(" · ");}
export async function loadNotifications(){const {supabase}=await requireActive();const {data,error}=await supabase.from("inbox_notifications").select("id,title,body,url,read_at,created_at,report_id").order("created_at",{ascending:false}).limit(150);if(error)throw new Error("알림을 불러오지 못했습니다.");
 const reportOf=(item:{url:string;report_id:string|null})=>item.report_id??REPORT_URL.exec(item.url)?.[1]??null;
 const ids=[...new Set((data??[]).map(reportOf).filter((id):id is string=>Boolean(id)))];
 const contexts=new Map<string,string>();
 if(ids.length){const {data:reports}=await supabase.from("reports").select("id,meeting_date,meeting_label,group:groups!reports_group_id_fkey(name),service:service_types(name),meeting:group_meeting_types(name)").in("id",ids).returns<ReportContext[]>();for(const r of reports??[])contexts.set(r.id,reportContext(r));}
 return (data??[]).map(({report_id,...item})=>{const rid=reportOf({url:item.url,report_id});return {...item,context:rid?contexts.get(rid)??null:null,title:item.title.replaceAll("새 목회 피드백이 등록되었습니다","새 코멘트가 등록되었습니다").replaceAll("새 피드백이 등록되었습니다","새 코멘트가 등록되었습니다").replaceAll("피드백에 답글","코멘트에 답글").replaceAll("댓글에 답글","코멘트에 답글")};});}
export async function addFeedbackReply(form:FormData){const {supabase,profile}=await requireActive();const v=z.object({kind:z.enum(["report","incident","prayer","notice"]),commentId:z.uuid(),body:z.string().trim().min(1).max(1000)}).parse(formFields(form));const {error}=await supabase.from(`${v.kind}_comment_replies`).insert({comment_id:v.commentId,author_id:profile.id,body:v.body});if(error)throw new Error("답글을 저장하지 못했습니다. 열람 권한과 내용을 확인해 주세요.");refresh();}

export async function loadUnreadNotificationCount(){const {supabase}=await requireActive();const {count,error}=await supabase.from("inbox_notifications").select("id",{count:"exact",head:true}).is("read_at",null);if(error)throw new Error("알림 수를 불러오지 못했습니다.");return count??0;}
