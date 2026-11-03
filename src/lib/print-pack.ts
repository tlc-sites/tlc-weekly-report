import type {ReportClient} from "./groups";
import {addDays,latestWeekday} from "./week";
import type {SummaryGroup,SummaryReport,SummaryIncident} from "./weekly-summary";

// 화요일 교역자 회의용 인쇄본: 화요일 기준 4일 전 금요일부터 전날 월요일까지 열린 모임의 보고.
// 다른 요일에 만들면 가장 최근 화요일을 기준으로 한다. 예: 11/10(화) → 11/6(금)~11/9(월)
export function printRange(today:string){
 const tuesday=latestWeekday(today,2);
 return {tuesday,from:addDays(tuesday,-4),to:addDays(tuesday,-1)};
}

export type PrintReport=SummaryReport&{attend_snapshot?:number|null;enrolled_snapshot?:number|null;issues:{category:string;content:string;action:string|null;status:string}[]};
export type PrintPack={from:string;to:string;groups:SummaryGroup[];reports:PrintReport[];incidents:SummaryIncident[]};

// 제출·확인된 보고만 담는다(임시저장 제외). 개인 기도제목·비공개 메시지는 보고 행에 없어 담기지 않는다.
export async function loadPrintPack(client:ReportClient,from:string,to:string):Promise<PrintPack>{
 const [{data:groups,error:gError},{data:reports,error:rError},{data:incidents,error:iError}]=await Promise.all([
  client.from("groups").select("id,name,type,sort_order,settings,parent_id").eq("is_active",true).order("sort_order"),
  client.from("reports").select("id,author_id,group_id,author_name,duty_part,meeting_date,meeting_label,status,details,attend_snapshot,enrolled_snapshot,service_type_id,service:service_types(name,sort_order)").gte("meeting_date",from).lte("meeting_date",to).neq("status","draft").order("meeting_date"),
  client.from("worship_incidents").select("id,author_id,report_id,author:profiles!author_id(real_name),title,occurred_on,service_id,service_name,circumstances,response,status,group_ids").gte("occurred_on",from).lte("occurred_on",to).order("occurred_on")]);
 if(gError||rError||iError)throw gError??rError??iError;
 const rows=(reports??[]) as unknown as SummaryReport[];
 const ids=rows.map(r=>r.id);
 const issues=ids.length?await client.from("report_issues").select("report_id,category,content,action,status").in("report_id",ids):null;
 if(issues?.error)throw issues.error;
 return {from,to,groups:(groups??[]) as SummaryGroup[],incidents:(incidents??[]) as unknown as SummaryIncident[],
  reports:rows.map(r=>({...r,issues:(issues?.data??[]).filter(i=>i.report_id===r.id)}))};
}
