import {runWeeklyEmail} from "./weekly-email";
import {createAdminClient} from "./supabase/admin";
import {sendToSubscriptions} from "./push";
import {weekOf} from "./week";
export async function runMeetingReminders(){
 const admin=createAdminClient();
 const {data,error}=await admin.rpc("claim_meeting_reminders");if(error)throw error;
 let sent=0,failed=0;
 for(const item of data??[]){
  const {data:subs,error:subError}=await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id",item.user_id);
  if(subError){failed++;continue;}
  try{const r=await sendToSubscriptions(admin,subs??[],{title:"보고서 제출을 확인해 주세요",body:item.label+" · "+item.meeting_date+" · 모임 종료 후 3시간이 지났습니다.",url:"/groups/"+item.group_id+"?week="+weekOf(item.meeting_date),tag:"meeting:"+item.group_id+":"+item.meeting_date},[item.user_id]);sent+=r.sent;failed+=r.failed;}catch{failed++;}
 }
 const weeklyEmail=await runWeeklyEmail();
 return {claimed:data?.length??0,sent,failed,weeklyEmail};
}
