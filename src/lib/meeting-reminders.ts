import {runWeeklyEmail} from "./weekly-email";
import {createAdminClient} from "./supabase/admin";
import {sendToSubscriptions} from "./push";
import {meetingReminderUrl,reminderPick} from "./reminder-link";
export async function runMeetingReminders(){
 const admin=createAdminClient();
 const {data,error}=await admin.rpc("claim_meeting_reminders");if(error){console.error("[meeting-reminders] claim failed",error.code);throw new Error("meeting reminder claim failed");}
 let sent=0,failed=0;
 // 알림을 누르면 그 예배·모임이 골라진 작성 화면으로: 그룹별 알림 설정·파트 모임을 한 번에 읽는다(못 읽으면 예전처럼 파트 화면)
 const gids=[...new Set(((data??[]) as {group_id:string}[]).map(i=>i.group_id))];
 const [sch,mts]=gids.length?await Promise.all([admin.from("meeting_deadline_schedules").select("group_id,label,service_type_id").in("group_id",gids).eq("is_active",true),admin.from("group_meeting_types").select("id,group_id,name").in("group_id",gids).eq("is_active",true)]):[null,null];
 for(const item of data??[]){
  const {data:subs,error:subError}=await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id",item.user_id);
  if(subError){failed++;continue;}
  try{const r=await sendToSubscriptions(admin,subs??[],{title:item.label+" 보고서 작성 부탁드립니다",body:item.meeting_date+" · 모임 종료 후 3시간이 지났습니다. 아직 제출하지 않은 보고서를 작성해 주세요.",url:meetingReminderUrl(item.group_id,item.meeting_date,reminderPick(item.group_id,item.label,sch?.data??[],mts?.data??[])),tag:"meeting:"+item.group_id+":"+item.meeting_date},[item.user_id]);sent+=r.sent;failed+=r.failed;}catch{failed++;}
 }
 const weeklyEmail=await runWeeklyEmail();
 return {claimed:data?.length??0,sent,failed,weeklyEmail};
}
