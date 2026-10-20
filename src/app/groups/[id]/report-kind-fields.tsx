"use client";
import {useState,type ReactNode} from "react";
import {Field,inputClass,selectClass} from "@/components/ui";
import {SESSION_LABEL} from "@/lib/team-session";
export function ReportKindFields({children,minDate,maxDate}:{children:ReactNode;minDate:string;maxDate:string}){
  const [kind,setKind]=useState<keyof typeof SESSION_LABEL>("standard");
  return <><Field label="보고 종류"><select name="reportKind" className={selectClass} value={kind} onChange={e=>setKind(e.target.value as keyof typeof SESSION_LABEL)}>{Object.entries(SESSION_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>{kind==="standard"?children:<><input type="hidden" name="meeting" value="custom"/><input type="hidden" name="customLabel" value={SESSION_LABEL[kind]}/><Field label="모임 날짜"><input name="meetingDate" type="date" required min={minDate} max={maxDate} defaultValue={maxDate} className={inputClass}/></Field></>}</>;
}
