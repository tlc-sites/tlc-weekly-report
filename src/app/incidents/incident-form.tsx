"use client";

import { useActionState, useState } from "react";
import { WORSHIP_ISSUE_CATEGORIES } from "@/lib/report-forms";
import { Field, ErrorText, inputClass, selectClass, textareaClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { INCIDENT_STATUS, type Incident } from "@/lib/incidents";
import { saveIncident } from "./actions";

type Option = { id:string; name:string };
type FormState = {error:string; values?:Record<string,string>; groups?:string[]};
export function IncidentForm({ incident, groups=[], services=[], initial, today, simple=false, returnTo }: {
  simple?:boolean; returnTo?:string;
  incident?:Incident; groups?:Option[]; services?:Option[]; today:string;
  initial?:{report_id:string;group_id:string;occurred_on:string;service_id:string;service_name:string};
}) {
  const [detailed,setDetailed]=useState(incident?.detailed ?? !simple);
  const [state,action] = useActionState<FormState,FormData>(async (previous,form) => {
    const result=await saveIncident(previous,form);
    // 검증 오류 후에도 React의 폼 초기화가 방금 입력한 내용으로 돌아오게 한다.
    return {...result,values:Object.fromEntries(Array.from(form.entries()).map(([k,v])=>[k,String(v)])),groups:form.getAll("group_ids").map(String)};
  },{error:""});
  const value=(name:string,fallback="")=>state.values?.[name] ?? fallback;
  return <form action={action} className="flex flex-col gap-5">
    <input type="hidden" name="detailed" value={String(detailed)}/>
    <input type="hidden" name="returnTo" value={returnTo ?? ""}/>
    {state.error ? <ErrorText>{state.error}</ErrorText> : null}
    {incident ? <><input type="hidden" name="id" value={incident.id}/><input type="hidden" name="version" value={incident.updated_at}/></> : <>
      <input type="hidden" name="report_id" value={initial?.report_id ?? ""}/>
      {initial ? <><input type="hidden" name="occurred_on" value={initial.occurred_on}/><p className="text-sm text-muted">{initial.occurred_on} · {initial.service_name}</p></> : <Field label="예배 날짜"><input className={inputClass} type="date" name="occurred_on" required max={today} defaultValue={value("occurred_on",today)}/></Field>}
      {initial ? <><input type="hidden" name="service_id" value={initial.service_id}/><input type="hidden" name="service_name" value={initial.service_name}/></> : <>
        <Field label="예배 구분"><select name="service_id" defaultValue={value("service_id")} className={selectClass}><option value="">기타 예배 (아래에 이름 입력)</option>{services.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="기타 예배 이름" hint="목록에서 선택했다면 비워 두셔도 됩니다."><input name="service_name" className={inputClass} maxLength={100} defaultValue={value("service_name")}/></Field>
      </>}
      <fieldset><legend className="mb-2 text-[15px] font-medium">작성하는 팀</legend>
        <p className="mb-3 text-xs text-muted">현재 팀의 이슈를 작성합니다. 같은 예배의 이슈는 예배별 목록에 함께 모입니다.</p>
        <div className="grid grid-cols-2 gap-2">{groups.filter(g=>!initial || g.id===initial.group_id).map(g=><label key={g.id} className="flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
          <input type="radio" required name="group_ids" value={g.id} defaultChecked={state.groups ? state.groups.includes(g.id) : initial?.group_id===g.id}/>{g.name}
        </label>)}</div>
      </fieldset>
    </>}
    <Field label="이슈 제목"><input name="title" required maxLength={100} className={inputClass} defaultValue={value("title",incident?.title)}/></Field>
    <Field label="이슈 분류"><select name="category" className={selectClass} defaultValue={value("category",incident?.category ?? WORSHIP_ISSUE_CATEGORIES[0])}>{Array.from(new Set([...WORSHIP_ISSUE_CATEGORIES,incident?.category].filter(Boolean) as string[])).map(c=><option key={c}>{c}</option>)}</select></Field>
    <Field label="발생 경위" hint="언제, 어떤 상황에서 무엇이 발생했는지 적어 주세요."><textarea name="circumstances" required maxLength={3000} className={textareaClass} defaultValue={value("circumstances",incident?.circumstances)}/></Field>
    <Field label="조치 내용·대응 결과"><textarea name="response" maxLength={2000} className={textareaClass} defaultValue={value("response",incident?.response)}/></Field>
    <details open={detailed} onToggle={e=>{if(e.currentTarget.open) setDetailed(true);}} className="rounded-xl border border-border p-4">
      <summary className="font-medium text-accent">상세 경위·후속 조치 작성</summary>
      <div className="mt-5 flex flex-col gap-5">
        <Field label="담당 교역자"><input name="pastor" maxLength={100} className={inputClass} defaultValue={value("pastor",incident?.pastor)}/></Field>
        <Field label="당시 참여 인원"><input name="participants" maxLength={500} className={inputClass} defaultValue={value("participants",incident?.participants)}/></Field>
        <Field label="발생 원인" hint="아직 파악하지 못했다면 비워 두세요. 열람 화면에는 ‘확인 중’으로 표시합니다."><textarea name="cause" maxLength={2000} className={textareaClass} defaultValue={value("cause",incident?.cause)}/></Field>
        <Field label="향후 개선대책"><textarea name="prevention" maxLength={2000} className={textareaClass} defaultValue={value("prevention",incident?.prevention)}/></Field>
        <Field label="후속 조치 담당자"><input name="follow_up_owner" maxLength={100} className={inputClass} defaultValue={value("follow_up_owner",incident?.follow_up_owner)}/></Field>
        <Field label="조치 목표일"><input name="due_on" type="date" className={inputClass} defaultValue={value("due_on",incident?.due_on ?? "")}/></Field>
      </div>
    </details>
    <Field label="처리 상태" hint={detailed ? "상세 경위서의 해결 처리에는 대응 결과와 개선대책이 필요합니다." : "필요하면 상세 경위와 후속 조치를 추가해 주세요."}><select name="status" className={selectClass} defaultValue={value("status",incident?.status ?? "open")}>{Object.entries(INCIDENT_STATUS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Field>
    <p className="text-xs leading-relaxed text-muted">작성자, 관련 팀 검토자와 관리자만 볼 수 있습니다.</p>
    <SubmitButton pendingText="저장 중…">{incident ? "변경 내용 저장" : "이슈 등록"}</SubmitButton>
  </form>;
}
