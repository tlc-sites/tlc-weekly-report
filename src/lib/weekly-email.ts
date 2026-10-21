import "server-only";
import nodemailer from "nodemailer";
import {createAdminClient} from "./supabase/admin";
import {loadWeeklySummary} from "./weekly-summary-data";
import {weeklyEmailHtml} from "./weekly-summary";
import {weekOf,todayKST} from "./week";
export async function runWeeklyEmail(){
 if(process.env.WEEKLY_EMAIL_ENABLED!=="true")return {skipped:"disabled"};
 const now=new Date();const kst=new Date(now.getTime()+9*3600000);
 if(kst.getUTCDay()!==5||kst.getUTCHours()<17)return {skipped:"outside delivery window"};
 const user=process.env.GMAIL_USER?.trim(),pass=process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g,"");
 if(!user||!pass)return {skipped:"mail not configured"};
 const admin=createAdminClient();const week=weekOf(todayKST());
 const {data:recipients,error}=await admin.from("profiles").select("id,email").eq("status","active").not("recipient_role","is",null);if(error)throw new Error("weekly recipients unavailable");
 if(!recipients?.length)return {skipped:"no senior recipients"};
 const data=await loadWeeklySummary(admin,week),html=weeklyEmailHtml(week,data.reports,data.groups,data.incidents);
 const tx=nodemailer.createTransport({host:"smtp.gmail.com",port:465,secure:true,auth:{user,pass},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000,disableFileAccess:true,disableUrlAccess:true});
 let sent=0,failed=0;
 for(const p of recipients){if(!p.email)continue;
  const {data:claimed,error:claimError}=await admin.rpc("claim_weekly_email",{p_week:week,p_recipient:p.id});if(claimError){failed++;continue;}if(!claimed)continue;
  // 발송 직전 역할을 다시 확인한다. 기능 관리자나 지정되지 않은 주소에는 보내지 않는다.
  const {data:active}=await admin.from("profiles").select("id,email,recipient_role,status").eq("id",p.id).maybeSingle();
  if(!active||active.status!=="active"||!active.recipient_role||active.email!==p.email){await admin.from("weekly_email_deliveries").update({status:"failed"}).eq("week",week).eq("recipient_id",p.id);continue;}
  try{
   await tx.sendMail({from:{name:"TLC 교회 보고서",address:user},to:p.email,subject:"[TLC] "+week+" 주간 사역 요약",html,messageId:"<weekly-"+week+"-"+p.id+"@tlc-weekly-report.vercel.app>"});
   const {error:updateError}=await admin.from("weekly_email_deliveries").update({status:"sent",sent_at:new Date().toISOString()}).eq("week",week).eq("recipient_id",p.id);
   if(updateError){failed++;continue;}sent++;
  }catch{failed++;await admin.from("weekly_email_deliveries").update({status:"failed"}).eq("week",week).eq("recipient_id",p.id);}
 }
 return {sent,failed};
}
