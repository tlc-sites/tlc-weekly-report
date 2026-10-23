import type {ReportClient} from "./groups";
import {addDays,todayKST} from "./week";
import type {SummaryGroup,SummaryReport,SummaryIncident} from "./weekly-summary";
export async function loadWeeklySummary(client:ReportClient,week:string){
 const end=[addDays(week,6),todayKST()].sort()[0];
 const [{data:groups,error:gError},{data:reports,error:rError},{data:incidents,error:iError}]=await Promise.all([
 client.from("groups").select("id,name,type,sort_order,settings,parent_id").eq("is_active",true).order("sort_order"),
 client.from("reports").select("id,author_id,group_id,author_name,duty_part,meeting_date,meeting_label,status,details,service_type_id,service:service_types(name,sort_order)").eq("week",week).neq("status","draft").lte("meeting_date",end).order("meeting_date"),
 client.from("worship_incidents").select("id,author_id,report_id,author:profiles!author_id(real_name),title,occurred_on,service_id,service_name,circumstances,response,status,group_ids").gte("occurred_on",week).lte("occurred_on",end).order("occurred_on")]);
 if(gError||rError||iError)throw gError??rError??iError;
 const rs=(reports??[]) as unknown as SummaryReport[];
 const ids=rs.map(r=>r.id);const issues=ids.length?await client.from("report_issues").select("report_id,category,content,action,status").in("report_id",ids):null;if(issues?.error)throw issues.error;
 const withIssues:SummaryReport[]=rs.map(r=>({...r,details:{...r.details,issue_summary:(issues?.data??[]).filter(i=>i.report_id===r.id).map(i=>i.category+" · "+i.content+(i.action?" / 조치: "+i.action:"")).join("\n")}}));
 const incidentRows=(incidents??[]) as unknown as SummaryIncident[];
 const authorIds=[...new Set(incidentRows.map(i=>i.author_id).filter((id):id is string=>Boolean(id)))];
 const assignments=authorIds.length?await client.from("memberships").select("user_id,group_id,position").in("user_id",authorIds):null;
 if(assignments?.error)throw assignments.error;
 const identifiedIncidents=incidentRows.map(i=>({...i,duty_part:(assignments?.data??[]).filter(a=>a.user_id===i.author_id&&i.group_ids.includes(a.group_id)).map(a=>a.position).filter(Boolean).join(" · ")}));
 const all=(groups??[]) as (SummaryGroup&{parent_id:string|null})[];
 return {groups:all,reports:withIssues,incidents:identifiedIncidents};
}
