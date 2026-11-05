"use server";
import {z} from "zod";
import {refresh} from "next/cache";
import {requireActive,isClergy} from "@/lib/auth";
import {notifyReportSubmission} from "@/lib/report-submission-push";

// 목사님·사모님·교역자가 제출된 보고서를 다른 팀에 공유(태그)한다. 권한·대상 확인은 DB 함수가 다시 한다.
export async function tagReportTeams(input:{reportId:string;groupIds:string[];memo:string}):Promise<{ok:boolean;message:string}>{
 const {supabase,profile}=await requireActive();
 if(!isClergy(profile))return {ok:false,message:"목사님·사모님·교역자만 팀에 공유할 수 있습니다."};
 const v=z.object({reportId:z.uuid(),groupIds:z.array(z.uuid()).min(1).max(10),memo:z.string().trim().max(300)}).safeParse(input);
 if(!v.success)return {ok:false,message:"공유할 팀을 1~10개 골라 주세요. 메모는 300자까지입니다."};
 const since=new Date().toISOString();
 const {data,error}=await supabase.rpc("tag_report_teams",{rid:v.data.reportId,gids:v.data.groupIds,note:v.data.memo});
 if(error)return {ok:false,message:"공유하지 못했습니다. 제출된 보고인지와 권한을 확인해 주세요."};
 // 알림함에 들어간 알림을 휴대폰으로도 보낸다. 실패해도 태그·알림함은 이미 저장됐다.
 let pushed=true;try{await notifyReportSubmission(v.data.reportId,since);}catch{pushed=false;}
 refresh();
 return {ok:true,message:`${data}개 팀에 공유하고 알림을 보냈습니다.${pushed?"":" (휴대폰 알림은 보내지 못했습니다.)"}`};
}

export async function untagReportTeam(input:{reportId:string;groupId:string}):Promise<{ok:boolean;message:string}>{
 const {supabase,profile}=await requireActive();
 if(!isClergy(profile))return {ok:false,message:"권한이 없습니다."};
 const v=z.object({reportId:z.uuid(),groupId:z.uuid()}).safeParse(input);
 if(!v.success)return {ok:false,message:"잘못된 요청입니다."};
 const {error}=await supabase.rpc("untag_report_team",{rid:v.data.reportId,gid:v.data.groupId});
 if(error)return {ok:false,message:"공유를 취소하지 못했습니다."};
 refresh();
 return {ok:true,message:"공유를 취소했습니다."};
}
