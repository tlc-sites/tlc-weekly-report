import "server-only";
import {createAdminClient} from "./supabase/admin";
import {sendToSubscriptions} from "./push";

// 신규 신청 직후 발송하고, 실패한 건은 정기 알림 작업에서 재시도한다.
export async function notifyRegistrationAlerts(applicantId?:string){
  const admin=createAdminClient();
  let query=admin.from("registration_alerts").select("applicant_id").is("delivered_at",null).order("created_at").limit(20);
  if(applicantId)query=query.eq("applicant_id",applicantId);
  const {data:alerts,error}=await query;if(error)return {sent:0,failed:1};
  let sent=0,failed=0;
  for(const alert of alerts??[]){
    const claim=await admin.rpc("claim_registration_alert",{p_user:alert.applicant_id});if(!claim.data)continue;
    const {data:applicant}=await admin.from("profiles").select("status,requested_group_ids").eq("id",alert.applicant_id).maybeSingle();
    if(!applicant || applicant.status!=="pending" || !applicant.requested_group_ids?.length){await admin.from("registration_alerts").update({delivered_at:new Date().toISOString()}).eq("applicant_id",alert.applicant_id);continue;}
    const {data:people,error:peopleError}=await admin.from("profiles").select("id").eq("status","active").eq("notify_enabled",true).or("is_admin.eq.true,recipient_role.not.is.null");
    if(peopleError || !people?.length){failed++;continue;}
    const {data:subscriptions,error:subError}=await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").in("user_id",people.map(p=>p.id));
    if(subError || !subscriptions?.length){failed++;continue;}
    try {
      const result=await sendToSubscriptions(admin,subscriptions,{title:"새 등록 신청이 도착했습니다",body:"사용자 관리에서 신청 내용을 확인해 주세요.",url:"/admin/users",tag:`registration:${alert.applicant_id}`});
      if(result.failed===0 && result.sent>0){await admin.from("registration_alerts").update({delivered_at:new Date().toISOString()}).eq("applicant_id",alert.applicant_id);sent++;}else failed++;
    }catch{failed++;}
  }
  return {sent,failed};
}
