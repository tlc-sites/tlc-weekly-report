"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActive } from "@/lib/auth";
import { incidentFields } from "@/lib/incidents";
import { todayKST } from "@/lib/week";

export type IncidentState = { error: string };
export async function saveIncident(_: IncidentState, form: FormData): Promise<IncidentState> {
  const { supabase, profile } = await requireActive();
  const values = Object.fromEntries(form);
  const parsed = incidentFields.safeParse(values);
  if (!parsed.success) return { error: "필수 항목과 글자 수를 확인해 주세요. 해결 처리에는 대응 결과와 개선대책이 필요합니다." };
  const fields = { ...parsed.data, due_on: parsed.data.due_on || null };
  const target=form.get("returnTo");
  const returnTo=typeof target==="string" && /^\/reports\/[0-9a-f-]{36}$/i.test(target) ? target : null;
  const id = form.get("id");
  if (id) {
    if (!z.uuid().safeParse(id).success) return {error:"올바른 이슈가 아닙니다."};
    const version = form.get("version");
    if (typeof version!=="string" || !version) return {error:"화면을 새로 열어 주세요."};
    const { data, error } = await supabase.from("worship_incidents").update(fields).eq("id",id).eq("updated_at",version).select("id").maybeSingle();
    if (error || !data) return {error:"저장하지 못했습니다. 다른 담당자가 수정했거나 권한이 바뀌었을 수 있습니다. 화면을 새로 열어 확인해 주세요."};
    redirect(returnTo ? `${returnTo}#team-issues` : `/incidents/${id}?saved=1`);
  }
  const context = z.object({
    occurred_on: z.iso.date(), service_id: z.union([z.uuid(),z.literal("")]),
    service_name: z.string().trim().max(100), report_id: z.union([z.uuid(),z.literal("")]),
    group_ids: z.array(z.uuid()).length(1),
  }).safeParse({...values,group_ids:form.getAll("group_ids")});
  if (!context.success) return {error:"예배 날짜와 관련 파트를 선택해 주세요."};
  const c = context.data;
  if(c.report_id) {
    const {data:source}=await supabase.from("reports").select("group_id").eq("id",c.report_id).maybeSingle();
    if(!source || c.group_ids[0]!==source.group_id) return {error:"현재 보고의 팀 이슈만 작성할 수 있습니다."};
  }
  if (c.occurred_on>todayKST() || (!c.service_id && !c.service_name)) return {error:"미래 날짜는 선택할 수 없습니다. 예배도 선택해 주세요."};
  const {data,error} = await supabase.from("worship_incidents").insert({
    ...fields, ...c, author_id:profile.id, service_id:c.service_id || null,
    report_id:c.report_id || null, service_name:c.service_name || "예배",
  }).select("id").single();
  if (error || !data) return {error:"등록하지 못했습니다. 본인 담당 파트를 포함하고 연결한 보고의 예배·날짜를 확인해 주세요."};
  redirect(returnTo ? `${returnTo}#team-issues` : `/incidents/${data.id}?saved=1`);
}
