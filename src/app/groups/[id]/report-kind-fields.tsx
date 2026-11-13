"use client";
import {useState,type ReactNode} from "react";
import {Field,inputClass} from "@/components/ui";
import {SESSION_LABEL} from "@/lib/team-session";
import {ChoiceChips} from "./choice-chips";
const KIND_SUB:Record<keyof typeof SESSION_LABEL,string>={standard:"예배·사역을 마친 뒤",meeting:"팀 회의 내용",curriculum:"공과 진행 내용",assembly:"팀 전체 출결·모임 내용"};
export function ReportKindFields({children,minDate,maxDate,kinds,initialKind}:{children:ReactNode;minDate:string;maxDate:string;kinds:(keyof typeof SESSION_LABEL)[];initialKind?:keyof typeof SESSION_LABEL}){
  // 지난번에 이 파트에서 고른 보고 종류를 먼저 골라 둔다
  const [kind,setKind]=useState<keyof typeof SESSION_LABEL>(initialKind&&kinds.includes(initialKind)?initialKind:"standard");
  return <><ChoiceChips legend="어떤 보고인가요?" name="reportKind" value={kind} onChange={setKind} options={kinds.map(k=>({value:k,label:SESSION_LABEL[k],sub:KIND_SUB[k]}))}/>{kind==="standard"?children:<><input type="hidden" name="meeting" value="custom"/><input type="hidden" name="customLabel" value={SESSION_LABEL[kind]}/><Field label="모임 날짜"><input name="meetingDate" type="date" required min={minDate} max={maxDate} defaultValue={maxDate} className={inputClass}/></Field>{kind==="assembly"?<p className="text-xs text-muted">이 팀 명단이 출결표에 미리 채워집니다. 명단에 없는 사람은 작성 화면에서 추가할 수 있습니다.</p>:null}</>}</>;
}
