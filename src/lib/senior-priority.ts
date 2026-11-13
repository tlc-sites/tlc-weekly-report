import type {SummaryIncident,SummaryReport} from "./weekly-summary";

// 주간 요약 '중요한 것부터' 보기: 이미 저장된 표시(진행 결과·확인·조치·이슈·요청사항)와 받은 글 여부로만 나눈다.
export type PriorityTier="urgent"|"message"|"review"|"clear";
export const PRIORITY_TITLE:Record<PriorityTier,string>={urgent:"먼저 보실 것",message:"두 분께 드리는 글",review:"살펴볼 것",clear:"이상 없음"};
export type PriorityItem={kind:"report";report:SummaryReport}|{kind:"incident";incident:SummaryIncident};

export function reportTier(r:SummaryReport,hasMessage:boolean):PriorityTier{
 const d=r.details;
 if(d.result==="incident"||(d.needs_attention===true&&d.attention_status!=="resolved"))return "urgent";
 if(hasMessage)return "message";
 const issues=typeof d.issue_summary==="string"&&d.issue_summary!=="";
 const requests=Array.isArray(d.requests)&&d.requests.some(x=>x&&typeof x.content==="string"&&x.content.trim());
 if(d.result==="minor"||d.result==="other"||issues||requests||d.needs_attention===true)return "review";
 return "clear";
}

// 보고가 수정된 뒤 다시 열지 않았으면 안 읽은 것으로 본다(보고 화면의 '수정 후 미열람'과 같은 기준)
export function isUnread(r:SummaryReport,readVersions:Map<string,string>){return !r.updated_at||readVersions.get(r.id)!==r.updated_at;}

export function priorityTiers(reports:SummaryReport[],incidents:SummaryIncident[],messageReportIds:Set<string>){
 const tiers:Record<PriorityTier,PriorityItem[]>={urgent:[],message:[],review:[],clear:[]};
 for(const i of incidents)tiers[i.status==="resolved"?"review":"urgent"].push({kind:"incident",incident:i});
 for(const r of reports.filter(r=>r.status!=="draft"))tiers[reportTier(r,messageReportIds.has(r.id))].push({kind:"report",report:r});
 return (Object.keys(tiers) as PriorityTier[]).map(tier=>({tier,title:PRIORITY_TITLE[tier],items:tiers[tier]}));
}
