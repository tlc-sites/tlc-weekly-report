"use client";
import {useState} from "react";
import {Field,inputClass,smallButtonClass} from "@/components/ui";
import {SESSION_LABEL,type TeamSessionPayload} from "@/lib/team-session";
import {ReportForm,Section,TextArea,MessagesEditor} from "./form-parts";
export function TeamSessionForm({reportId,initial,action,showMessages}:{reportId:string;initial:TeamSessionPayload;action:(form:FormData)=>Promise<void>;showMessages:boolean}){
  const [p,setP]=useState(initial);const d=p.details;
  const update=(patch:Partial<typeof d>)=>setP({...p,details:{...d,...patch}});
  const member=(index:number,patch:Partial<typeof d.members[number]>)=>update({members:d.members.map((m,i)=>i===index?{...m,...patch}:m)});
  return <ReportForm reportId={reportId} action={action} type="team_session" payload={p}><Section title={SESSION_LABEL[d.session_type]}>
    <Field label="주제"><input value={d.topic} onChange={e=>update({topic:e.target.value})} maxLength={200} className={inputClass}/></Field>
    {d.session_type==="curriculum"?<Field label="공과·성경 범위"><input value={d.passage} onChange={e=>update({passage:e.target.value})} maxLength={100} className={inputClass}/></Field>:null}
    <Field label="진행 장소"><input value={d.place} onChange={e=>update({place:e.target.value})} maxLength={200} className={inputClass}/></Field><TextArea label="진행 내용" value={d.content} maxLength={2000} onChange={content=>update({content})}/>
  </Section><Section title="팀원별 간단한 보고" hint="참석 여부와 필요한 상황·후속 조치를 짧게 남겨 주세요.">{d.members.map((m,i)=><div key={i} className="rounded-xl border border-border p-3"><Field label="팀원 이름"><input required maxLength={100} value={m.name} onChange={e=>member(i,{name:e.target.value})} className={inputClass}/></Field><label className="my-3 flex min-h-11 items-center gap-2"><input type="checkbox" checked={m.present} onChange={e=>member(i,{present:e.target.checked})}/>참석</label><TextArea label="간단한 상황" value={m.note} maxLength={500} onChange={note=>member(i,{note})}/><TextArea label="후속 조치" value={m.follow_up} maxLength={500} onChange={follow_up=>member(i,{follow_up})}/><button type="button" onClick={()=>update({members:d.members.filter((_,j)=>j!==i)})} className={`${smallButtonClass} mt-2`}>팀원 항목 삭제</button></div>)}<button type="button" disabled={d.members.length>=100} className={smallButtonClass} onClick={()=>update({members:[...d.members,{name:"",present:true,note:"",follow_up:""}]})}>+ 팀원 추가</button></Section>{showMessages?<MessagesEditor value={p.messages} onChange={messages=>setP({...p,messages})}/>:null}</ReportForm>;
}
