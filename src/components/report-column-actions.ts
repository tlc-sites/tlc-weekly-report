"use server";
import {z} from "zod";
import {requireActive} from "@/lib/auth";
import {groupDisplayName,meetingDisplayName} from "@/lib/group-display";

export type ColumnReport = { id: string; date: string; title: string; status: "draft" | "submitted" | "reviewed"; author: string; result: string | null; attention: boolean };
export type ReportColumn = { groupId: string; groupName: string; reports: ColumnReport[] };

type Row = { id: string; group_id: string; meeting_date: string; meeting_label: string | null; status: ColumnReport["status"]; author_name: string | null; result: string | null; attention: boolean | null; service: { name: string } | null; meeting: { name: string } | null };

// PC 가운데 보고 목록. 보고 id면 그 보고의 파트를 찾는다. 열람은 RLS가 그대로 거른다(볼 수 있는 보고만 나온다).
export async function loadReportColumn(input: { groupId?: string; reportId?: string }): Promise<ReportColumn | null> {
 const {supabase}=await requireActive();
 const v=z.object({groupId:z.uuid().optional(),reportId:z.uuid().optional()}).parse(input);
 let groupId=v.groupId;
 if(!groupId&&v.reportId){const {data}=await supabase.from("reports").select("group_id").eq("id",v.reportId).maybeSingle();groupId=data?.group_id as string|undefined;}
 if(!groupId)return null;
 const [{data:group},{data:rows,error}]=await Promise.all([
  supabase.from("groups").select("name").eq("id",groupId).maybeSingle(),
  supabase.from("reports").select("id,group_id,meeting_date,meeting_label,status,author_name,result:details->>result,attention:details->needs_attention,service:service_types(name),meeting:group_meeting_types(name)").eq("group_id",groupId).order("meeting_date",{ascending:false}).order("updated_at",{ascending:false}).limit(80).returns<Row[]>(),
 ]);
 if(error)throw new Error("보고 목록을 불러오지 못했습니다.");
 return {groupId,groupName:group?.name?groupDisplayName(group.name as string):"보고 목록",reports:(rows??[]).map(r=>({id:r.id,date:r.meeting_date,title:meetingDisplayName(r.service?.name??r.meeting?.name??r.meeting_label??"보고"),status:r.status,author:r.author_name??"작성자",result:r.result,attention:r.attention===true}))};
}
