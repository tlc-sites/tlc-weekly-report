"use client";
import {useState} from "react";
import {Field,inputClass,textareaClass} from "./ui";
import {SubmitButton} from "./submit-button";
const roles=["안내위원","헌금위원","말씀봉독"] as const;
export function WorshipStaffFields({initial}:{initial:string}){
 const lines=initial.split("\n");
 const [values,setValues]=useState(()=>Object.fromEntries(roles.map(role=>[role,lines.filter(line=>line.startsWith(role+": ")).map(line=>line.slice(role.length+2)).join(", ")])));
 const [other,setOther]=useState(()=>lines.filter(line=>!roles.some(role=>line.startsWith(role+": "))).join("\n"));
 const staff=[...roles.filter(role=>values[role]?.trim()).map(role=>role+": "+values[role].trim()),other.trim()].filter(Boolean).join("\n");
 return <><input type="hidden" name="staff" value={staff}/>{roles.map(role=><Field key={role} label={role}><input value={values[role]} maxLength={500} onChange={e=>setValues({...values,[role]:e.target.value})} className={inputClass} placeholder={role+" 이름을 적어 주세요"}/></Field>)}<Field label="그 외 예배위원·기존 기록"><textarea value={other} onChange={e=>setOther(e.target.value)} maxLength={2400} rows={3} className={textareaClass}/></Field><SubmitButton>모두에게 공유 · 저장</SubmitButton></>;
}
