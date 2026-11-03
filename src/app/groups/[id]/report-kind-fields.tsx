"use client";
import {useState,type ReactNode} from "react";
import {Field,inputClass,selectClass} from "@/components/ui";
import {SESSION_LABEL} from "@/lib/team-session";
export function ReportKindFields({children,minDate,maxDate,kinds}:{children:ReactNode;minDate:string;maxDate:string;kinds:(keyof typeof SESSION_LABEL)[]}){
  const [kind,setKind]=useState<keyof typeof SESSION_LABEL>("standard");
  return <><Field label="보고 종류"><select name="reportKind" className={selectClass} value={kind} onChange={e=>setKind(e.target.value as keyof typeof SESSION_LABEL)}>{kinds.map(k=><option key={k} value={k}>{SESSION_LABEL[k]}</option>)}</select></Field>{kind==="standard"?children:<><input type="hidden" name="meeting" value="custom"/><input type="hidden" name="customLabel" value={SESSION_LABEL[kind]}/><Field label="모임 날짜"><input name="meetingDate" type="date" required min={minDate} max={maxDate} defaultValue={maxDate} className={inputClass}/></Field>{kind==="assembly"?<p className="text-xs text-muted">이 팀 명단이 출결표에 미리 채워집니다. 명단에 없는 사람은 작성 화면에서 추가할 수 있습니다.</p>:null}</>}</>;
}
