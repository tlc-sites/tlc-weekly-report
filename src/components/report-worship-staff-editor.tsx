"use client";

import {useActionState} from "react";
import {saveReportWorshipStaff} from "@/app/reports/[id]/worship-staff-actions";
import {smallButtonClass,textareaClass} from "./ui";

export function ReportWorshipStaffEditor({reportId,staff,version}:{reportId:string;staff:string;version:string}){
 const [state,action,pending]=useActionState(saveReportWorshipStaff,{message:"",version});
 return <form action={action} className="mt-3 space-y-3">
  <input type="hidden" name="reportId" value={reportId}/>
  <input type="hidden" name="version" value={state.version}/>
  <label className="block text-sm">예배위원<textarea name="staff" defaultValue={staff} rows={4} maxLength={4000} placeholder="인도 / 대표기도 / 봉독 / 헌금 / 안내 담당자" className={textareaClass}/></label>
  <button disabled={pending} className={smallButtonClass}>{pending?"저장 중…":"예배위원 저장"}</button>
  {state.message?<p role="status" className="text-sm text-accent">{state.message}</p>:null}
 </form>;
}
